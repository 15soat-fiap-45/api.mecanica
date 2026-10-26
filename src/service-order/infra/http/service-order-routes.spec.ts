import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../../app.js';
import { InMemoryEventBus } from '../../../shared/application/in-memory-event-bus.js';
import type { DomainEvent } from '../../../shared/domain/domain-event.js';
import { serviceOrderCompositionRoot } from '../../composition-root.js';
import { ServiceOrder } from '../../domain/service-order/service-order.js';
import type { ServiceOrderRepository } from '../../domain/service-order/service-order.repository.js';
import { Budget } from '../../domain/budget/budget.js';
import type { BudgetRepository } from '../../domain/budget/budget.repository.js';
import { ApprovalRequest } from '../../domain/approval/approval-request.js';
import type { ApprovalRequestRepository } from '../../domain/approval/approval-request.repository.js';

vi.mock('../../../infra/database/connection.js', () => ({
    db: {},
    pool: { end: vi.fn() },
}));

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
});

function setup() {
    const orders = new Map<string, ServiceOrder>();
    const budgets = new Map<string, Budget>();
    const requests = new Map<string, ApprovalRequest>();
    const emails: { text: string }[] = [];
    const serviceOrderRepository: ServiceOrderRepository = {
        save: vi.fn(async (order: ServiceOrder) => {
            orders.set(order.id.value, order);
        }),
        findById: vi.fn(async (id) => orders.get(String(id)) ?? null),
    };
    const budgetRepository: BudgetRepository = {
        save: vi.fn(async (budget: Budget) => {
            budgets.set(budget.id.value, budget);
        }),
        findById: vi.fn(async (id) => budgets.get(String(id)) ?? null),
        findByServiceOrderId: vi.fn(async (id) =>
            [...budgets.values()].filter(
                (budget) => budget.serviceOrderId === id,
            ),
        ),
    };
    const busErrors = vi.fn();
    const bus = new InMemoryEventBus({ error: busErrors });
    const emailSender = {
        send: vi.fn(async (email: { text: string }) => {
            emails.push(email);
        }),
    };
    const approvals: ApprovalRequestRepository = {
        expirePending: vi.fn(async () => 0),
        issue: vi.fn(async (request) => {
            for (const existing of requests.values()) {
                if (
                    existing.orderId === request.orderId &&
                    existing.isActive(new Date())
                ) {
                    existing.revoke(new Date());
                }
            }
            requests.set(
                request.tokenHash,
                ApprovalRequest.restore(request.toPersistence()),
            );
        }),
        markSent: vi.fn(async (id) => {
            for (const request of requests.values()) {
                if (request.id === id) request.markSent(new Date());
            }
        }),
        findByTokenHash: vi.fn(async (hash) => {
            const request = requests.get(hash);
            return request
                ? ApprovalRequest.restore(request.toPersistence())
                : null;
        }),
        decide: vi.fn(async (request, budget) => {
            const stored = requests.get(request.tokenHash);
            if (stored?.usedAt) throw new Error('Concurrent approval');
            requests.set(
                request.tokenHash,
                ApprovalRequest.restore(request.toPersistence()),
            );
            if (budget.status.value === 'REJECTED') {
                orders.get(request.orderId)?.reject();
            }
        }),
    };
    const events: DomainEvent[] = [];
    for (const name of [
        'registered',
        'additional-supplies-included',
        'supply-used',
        'cancelled',
        'budget-approved',
        'awaiting-approval',
    ]) {
        bus.subscribe(`service-order.${name}`, (event) => {
            events.push(event);
        });
    }
    const serviceOrder = serviceOrderCompositionRoot(bus, {
        serviceOrderRepository,
        budgetRepository,
        serviceCatalog: {
            create: vi.fn(async (input) => ({ ...input, id: 1 })),
            list: vi.fn(async () => []),
            assign: vi.fn(async () => {}),
            forOrder: vi.fn(async () => [
                {
                    id: 1,
                    title: 'Freios',
                    description: null,
                    valueCents: 12345,
                    partIds: [],
                },
            ]),
        },
        approvalRequestRepository: approvals,
        vehicleContacts: {
            findByVehicleId: vi.fn(async (id) =>
                id === 'vehicle-1'
                    ? { name: 'Ana', email: 'ana@example.com' }
                    : null,
            ),
        },
        emailSender,
        frontendUrl: 'https://example.com',
        approvalTokenTtlMinutes: 30,
    });
    const app = buildApp({ serviceOrder });
    apps.push(app);
    return {
        app,
        orders,
        budgets,
        emails,
        emailSender,
        busErrors,
        requests,
        serviceOrder,
        events,
        serviceOrderRepository,
        budgetRepository,
    };
}

describe('Service Order HTTP integration', () => {
    it('creates an order and publishes the event after persistence', async () => {
        const { app, orders, events } = setup();
        const response = await app.inject({
            method: 'POST',
            url: '/service-orders',
            payload: {
                description: '  Troca de óleo  ',
                vehicleId: 'vehicle-1',
                id: 'caller-id',
            },
        });
        expect(response.statusCode).toBe(201);
        const order = response.json();
        expect(order).toEqual({
            id: expect.any(String),
            description: 'Troca de óleo',
            status: 'PENDING',
            vehicleId: 'vehicle-1',
        });
        expect(order.id).not.toBe('caller-id');
        expect(orders.has(order.id)).toBe(true);
        expect(events).toEqual([
            expect.objectContaining({
                eventName: 'service-order.registered',
                aggregateId: order.id,
            }),
        ]);
    });

    it('adds a supply using the order id from the route and publishes its normalized code', async () => {
        const { app, orders, events } = setup();
        orders.set(
            'os-1',
            ServiceOrder.create({ id: 'os-1', description: 'Freios' }),
        );
        const response = await app.inject({
            method: 'POST',
            url: '/service-orders/os-1/supplies',
            payload: {
                partCode: ' past-01 ',
                quantity: 2,
                serviceOrderId: 'other',
            },
        });
        expect(response.statusCode).toBe(201);
        expect(response.json()).toEqual({
            serviceOrderId: 'os-1',
            partCode: 'PAST-01',
            quantity: 2,
        });
        expect(events).toEqual([
            expect.objectContaining({
                eventName: 'service-order.additional-supplies-included',
                aggregateId: 'os-1',
                items: [{ partCode: 'PAST-01', quantity: 2 }],
            }),
        ]);
    });

    it('approves the budget through the bus, then allows recording supply usage', async () => {
        const { app, orders, budgets, events, emails } = setup();
        const order = ServiceOrder.create({
            id: 'os-1',
            description: 'Freios',
            vehicleId: 'vehicle-1',
        });
        order.addSupply('PAST-01', 2);
        order.pullEvents();
        orders.set('os-1', order);
        budgets.set(
            'budget-1',
            Budget.create({
                id: 'budget-1',
                serviceOrderId: 'os-1',
                totalCents: 12345,
            }),
        );

        const approved = await app.inject({
            method: 'POST',
            url: '/service-orders/os-1/awaiting-approval',
            payload: { budgetId: 'budget-1' },
        });
        expect(approved.statusCode).toBe(200);
        expect(approved.json()).toEqual({ status: 'AWAITING_APPROVAL' });
        expect(emails).toHaveLength(1);
        const token = emails[0]!.text.match(
            /orcamento\/([A-Za-z0-9_-]{43})/,
        )?.[1];
        expect(token).toBeTruthy();
        const decision = await app.inject({
            method: 'POST',
            url: '/budget-approvals/decide',
            payload: { token, decision: 'approved' },
        });
        expect(decision.statusCode).toBe(200);
        expect(decision.json()).toEqual({
            status: 'decided',
            decision: 'approved',
        });
        expect(orders.get('os-1')?.status.value).toBe('APPROVED');
        expect(
            (
                await app.inject({
                    method: 'POST',
                    url: '/budgets/budget-1/approve',
                })
            ).statusCode,
        ).toBe(404);

        const used = await app.inject({
            method: 'POST',
            url: '/service-orders/os-1/supplies/past-01/usage',
        });
        expect(used.statusCode).toBe(200);
        expect(used.json()).toEqual({
            serviceOrderId: 'os-1',
            partCode: 'PAST-01',
            quantity: 2,
            used: true,
        });
        expect(events.map((event) => event.eventName)).toEqual([
            'service-order.awaiting-approval',
            'service-order.budget-approved',
            'service-order.supply-used',
        ]);
    });

    it('keeps the awaiting status when SMTP fails and allows internal resend', async () => {
        const {
            app,
            orders,
            budgets,
            emailSender,
            busErrors,
            requests,
            serviceOrder,
            emails,
        } = setup();
        orders.set(
            'os-1',
            ServiceOrder.create({
                id: 'os-1',
                vehicleId: 'vehicle-1',
                description: 'Freios',
            }),
        );
        budgets.set(
            'budget-1',
            Budget.create({
                id: 'budget-1',
                serviceOrderId: 'os-1',
                totalCents: 12345,
            }),
        );
        emailSender.send.mockRejectedValueOnce(new Error('SMTP down'));
        const response = await app.inject({
            method: 'POST',
            url: '/service-orders/os-1/awaiting-approval',
            payload: { budgetId: 'budget-1' },
        });
        expect(response.statusCode).toBe(200);
        expect(orders.get('os-1')?.status.value).toBe('AWAITING_APPROVAL');
        expect(busErrors).toHaveBeenCalledOnce();
        expect([...requests.values()][0]?.sentAt).toBeNull();
        await serviceOrder.resendBudgetApproval.execute({
            serviceOrderId: 'os-1',
            budgetId: 'budget-1',
        });
        expect(emails).toHaveLength(1);
        expect(
            [...requests.values()].filter((request) =>
                request.isActive(new Date()),
            ),
        ).toHaveLength(1);
    });

    it('records rejection without approving the order and supports repeating the same decision', async () => {
        const { app, orders, budgets, emails } = setup();
        orders.set(
            'os-1',
            ServiceOrder.create({
                id: 'os-1',
                vehicleId: 'vehicle-1',
                description: 'Freios',
            }),
        );
        budgets.set(
            'budget-1',
            Budget.create({
                id: 'budget-1',
                serviceOrderId: 'os-1',
                totalCents: 12345,
            }),
        );
        await app.inject({
            method: 'POST',
            url: '/service-orders/os-1/awaiting-approval',
            payload: { budgetId: 'budget-1' },
        });
        const token = emails[0]!.text.match(
            /orcamento\/([A-Za-z0-9_-]{43})/,
        )![1]!;
        const decision = {
            token,
            decision: 'rejected',
            rejectionReason: 'Não autorizo',
        };
        const first = await app.inject({
            method: 'POST',
            url: '/budget-approvals/decide',
            payload: decision,
        });
        expect(first.statusCode).toBe(200);
        expect(
            [...budgets.values()].some(
                (budget) => budget.status.value === 'REJECTED',
            ),
        ).toBe(true);
        expect(orders.get('os-1')?.status.value).toBe('REJECTED');
        const repeat = await app.inject({
            method: 'POST',
            url: '/budget-approvals/decide',
            payload: decision,
        });
        expect(repeat.json()).toEqual({
            status: 'already_decided',
            decision: 'rejected',
        });
        const opposite = await app.inject({
            method: 'POST',
            url: '/budget-approvals/decide',
            payload: { token, decision: 'approved' },
        });
        expect(opposite.statusCode).toBe(400);
    });

    it('cancels an order and publishes cancellation only once on retries', async () => {
        const { app, orders, events } = setup();
        orders.set(
            'os-1',
            ServiceOrder.create({ id: 'os-1', description: 'Freios' }),
        );
        for (let i = 0; i < 2; i++) {
            const response = await app.inject({
                method: 'POST',
                url: '/service-orders/os-1/cancel',
            });
            expect(response.statusCode).toBe(200);
            expect(response.json()).toEqual({
                serviceOrderId: 'os-1',
                status: 'CANCELLED',
            });
        }
        expect(events).toHaveLength(1);
        expect(events[0]?.eventName).toBe('service-order.cancelled');
    });

    it.each([
        '/service-orders/missing/cancel',
        '/service-orders/missing/supplies/PAST-01/usage',
        '/service-orders/missing/awaiting-approval',
    ])('returns 404 for a missing resource at %s', async (url) => {
        const { app } = setup();
        const response = await app.inject({
            method: 'POST',
            url,
            payload: { budgetId: 'missing' },
        });
        expect(response.statusCode).toBe(404);
    });

    it.each([
        { partCode: 'PAST-01', quantity: 0 },
        { partCode: 'PAST-01', quantity: 1.5 },
        { partCode: 'bad_code', quantity: 1 },
        { partCode: 'PAST-01', quantity: 2147483648 },
    ])(
        'rejects invalid supplies before calling persistence: %j',
        async (payload) => {
            const { app, serviceOrderRepository, events } = setup();
            const response = await app.inject({
                method: 'POST',
                url: '/service-orders/os-1/supplies',
                payload,
            });
            expect(response.statusCode).toBe(400);
            expect(serviceOrderRepository.findById).not.toHaveBeenCalled();
            expect(events).toEqual([]);
        },
    );

    it('rejects blank descriptions before saving', async () => {
        const { app, serviceOrderRepository } = setup();
        const response = await app.inject({
            method: 'POST',
            url: '/service-orders',
            payload: { description: '  ' },
        });
        expect(response.statusCode).toBe(400);
        expect(serviceOrderRepository.save).not.toHaveBeenCalled();
    });

    it('returns 400 when a domain transition is forbidden', async () => {
        const { app, orders, events } = setup();
        orders.set(
            'os-1',
            ServiceOrder.create({ id: 'os-1', description: 'Freios' }),
        );
        const response = await app.inject({
            method: 'POST',
            url: '/service-orders/os-1/supplies/PAST-01/usage',
        });
        expect(response.statusCode).toBe(400);
        expect(response.json().error).toBe(
            'InvalidServiceOrderStatusException',
        );
        expect(events).toEqual([]);
    });

    it('does not publish events if persistence fails', async () => {
        const { app, serviceOrderRepository, events } = setup();
        vi.mocked(serviceOrderRepository.save).mockRejectedValueOnce(
            new Error('database down'),
        );
        const response = await app.inject({
            method: 'POST',
            url: '/service-orders',
            payload: { description: 'Freios', vehicleId: 'vehicle-1' },
        });
        expect(response.statusCode).toBe(500);
        expect(response.json().message).toBe('Internal server error.');
        expect(events).toEqual([]);
    });

    it('generates OpenAPI for the service order routes and serves Swagger', async () => {
        const { app } = setup();
        await app.ready();
        expect(Object.keys(app.swagger().paths ?? {})).toEqual(
            expect.arrayContaining([
                '/service-orders',
                '/service-orders/{serviceOrderId}/supplies',
                '/service-orders/{serviceOrderId}/supplies/{partCode}/usage',
                '/service-orders/{serviceOrderId}/cancel',
                '/service-orders/{serviceOrderId}/awaiting-approval',
                '/budget-approvals/decide',
            ]),
        );
        expect(
            (await app.inject({ method: 'GET', url: '/docs/json' })).statusCode,
        ).toBe(200);
    });

    it('serves the approval HTML page at /orcamento/:token and /orcamento', async () => {
        const { app } = setup();
        const withToken = await app.inject({
            method: 'GET',
            url: '/orcamento/abcdefghijklmnopqrstuvwxyz0123456789-_ABCDE',
        });
        expect(withToken.statusCode).toBe(200);
        expect(withToken.headers['content-type']).toContain('text/html');
        expect(withToken.body).toContain('Oficina Mecânica');
        expect(withToken.body).toContain('Aprovação de Orçamento');

        const baseRoute = await app.inject({
            method: 'GET',
            url: '/orcamento',
        });
        expect(baseRoute.statusCode).toBe(200);
        expect(baseRoute.headers['content-type']).toContain('text/html');
        expect(baseRoute.body).toContain('Oficina Mecânica');
    });

    it('lists an order with its associated services and moves it through execution and delivery', async () => {
        const { app, orders, emails } = setup();
        const order = ServiceOrder.create({
            id: 'os-1',
            vehicleId: 'vehicle-1',
            description: 'Freios',
        });
        order.approve();
        orders.set('os-1', order);
        const listed = await app.inject({
            method: 'GET',
            url: '/service-orders/os-1',
        });
        expect(listed.statusCode).toBe(200);
        expect(listed.json().services).toHaveLength(1);
        for (const [path, status] of [
            ['start', 'IN_PROGRESS'],
            ['finish', 'COMPLETED'],
            ['deliver', 'DELIVERED'],
        ]) {
            const response = await app.inject({
                method: 'POST',
                url: `/service-orders/os-1/${path}`,
            });
            expect(response.statusCode).toBe(200);
            expect(response.json().status).toBe(status);
        }
        expect(
            emails.some((email) => email.text.includes('pronto para retirada')),
        ).toBe(true);
    });

    it('accepts several services from a reusable catalog without requiring an existing budget id', async () => {
        const { app, orders } = setup();
        orders.set(
            'os-1',
            ServiceOrder.create({
                id: 'os-1',
                vehicleId: 'vehicle-1',
                description: 'Freios',
            }),
        );
        const created = await app.inject({
            method: 'POST',
            url: '/services',
            payload: { title: 'Freios', valueCents: 12345, partIds: [1, 2] },
        });
        expect(created.statusCode).toBe(201);
        const assigned = await app.inject({
            method: 'POST',
            url: '/service-orders/os-1/services',
            payload: { serviceId: created.json().id },
        });
        expect(assigned.statusCode).toBe(201);
        const awaiting = await app.inject({
            method: 'POST',
            url: '/service-orders/os-1/awaiting-approval',
        });
        expect(awaiting.statusCode).toBe(200);
        expect(awaiting.json().status).toBe('AWAITING_APPROVAL');
    });
});
