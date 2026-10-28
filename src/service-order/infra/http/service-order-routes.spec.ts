import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InjectOptions } from 'fastify';
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
import { actorContext } from '../../application/ports/actor-resolver.js';
import { TokenActorResolver } from '../../../infra/token-actor-resolver.js';

vi.mock('../../../infra/database/connection.js', () => ({
    db: {},
    pool: { end: vi.fn() },
}));

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
});

function setup(
    options: { defaultAuthorization?: string | undefined } = {
        defaultAuthorization: 'Bearer jwt-gerente',
    },
) {
    const orders = new Map<string, ServiceOrder>();
    const budgets = new Map<string, Budget>();
    const requests = new Map<string, ApprovalRequest>();
    const history = new Map<
        string,
        {
            status: ServiceOrder['status']['value'];
            valueCents: number | null;
            changedBy: string | null;
            recordedAt: Date;
        }[]
    >();
    const recordHistory = (
        orderId: string,
        status: ServiceOrder['status']['value'],
    ) => {
        const list = history.get(orderId) ?? [];
        if (list.at(-1)?.status === status) return;
        const orderBudget = [...budgets.values()]
            .filter((b) => b.serviceOrderId === orderId)
            .at(-1);
        list.push({
            status,
            valueCents: orderBudget
                ? orderBudget.totalCents
                : (orders.get(orderId)?.valueCents ?? null),
            changedBy: actorContext.getStore() ?? null,
            recordedAt: new Date(),
        });
        history.set(orderId, list);
    };
    const emails: { text: string }[] = [];
    const serviceOrderRepository: ServiceOrderRepository = {
        save: vi.fn(async (order: ServiceOrder, budget?: Budget) => {
            orders.set(order.id.value, order);
            if (budget) budgets.set(budget.id.value, budget);
            if (order.status.value === 'CANCELLED') {
                for (const existing of requests.values()) {
                    if (
                        existing.orderId === order.id.value &&
                        existing.isActive(new Date())
                    ) {
                        existing.revoke(new Date());
                    }
                }
            }
            recordHistory(order.id.value, order.status.value);
        }),
        findById: vi.fn(async (id) => orders.get(String(id)) ?? null),
        findStatusHistory: vi.fn(async (id) => history.get(String(id)) ?? []),
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
        expirePending: vi.fn(async (now: Date) => {
            const eligible = [...requests.values()]
                .filter((req) => {
                    const persisted = req.toPersistence();
                    const order = orders.get(req.orderId);
                    return (
                        !persisted.usedAt &&
                        !persisted.revokedAt &&
                        persisted.expiresAt <= now &&
                        order?.status.value === 'AWAITING_APPROVAL'
                    );
                })
                .slice(0, 100);
            for (const req of eligible) {
                const order = orders.get(req.orderId);
                const budget = budgets.get(req.budgetId);
                if (!order || !budget) continue;
                budget.reject();
                order.reject();
                requests.set(
                    req.tokenHash,
                    ApprovalRequest.restore({
                        ...req.toPersistence(),
                        decision: 'rejected',
                        usedAt: now,
                    }),
                );
                recordHistory(order.id.value, 'REJECTED');
            }
            return eligible.length;
        }),
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
                recordHistory(request.orderId, 'REJECTED');
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
    const tokenActors = {
        'jwt-gerente': { id: 'gerente-1', role: 'GERENTE' as const },
        'jwt-atendente': { id: 'atendente-1', role: 'ATENDENTE' as const },
        'jwt-mecanico': { id: 'mecanico-1', role: 'MECANICO' as const },
        'jwt-estoquista': { id: 'estoquista-1', role: 'ESTOQUISTA' as const },
    };
    const serviceOrder = serviceOrderCompositionRoot(bus, {
        serviceOrderRepository,
        budgetRepository,
        approvalRequestRepository: approvals,
        vehicleContacts: {
            findByVehicleId: vi.fn(async (id) =>
                id === 'vehicle-1'
                    ? { name: 'Ana', email: 'ana@example.com' }
                    : null,
            ),
        },
        actorResolver: new TokenActorResolver({
            verify: async (token) =>
                tokenActors[token as keyof typeof tokenActors] ?? null,
        }),
        emailSender,
        frontendUrl: 'https://example.com',
        approvalTokenTtlMinutes: 30,
    });
    const app = buildApp({ serviceOrder });
    if (options.defaultAuthorization) {
        const originalInject = app.inject.bind(app);
        app.inject = ((opts?: InjectOptions | string) => {
            if (!opts || typeof opts === 'string') {
                return originalInject(opts as string);
            }
            const url = typeof opts.url === 'string' ? opts.url : '';
            const isPublic =
                url.startsWith('/budget-approvals/') ||
                url.startsWith('/orcamento') ||
                url.startsWith('/docs');
            if (isPublic || opts.headers?.authorization !== undefined) {
                return originalInject(opts);
            }
            return originalInject({
                ...opts,
                headers: {
                    ...opts.headers,
                    authorization: options.defaultAuthorization,
                },
            });
        }) as typeof app.inject;
    }
    apps.push(app);
    return {
        app,
        orders,
        budgets,
        emails,
        emailSender,
        busErrors,
        requests,
        approvals,
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
            valueCents: null,
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
        const { app, orders, events, emails } = setup();
        const order = ServiceOrder.create({
            id: 'os-1',
            description: 'Freios',
            vehicleId: 'vehicle-1',
        });
        order.addSupply('PAST-01', 2);
        order.pullEvents();
        orders.set('os-1', order);

        const approved = await app.inject({
            method: 'POST',
            url: '/service-orders/os-1/awaiting-approval',
            payload: { valueCents: 12345 },
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
                valueCents: 12345,
            }),
        );
        emailSender.send.mockRejectedValueOnce(new Error('SMTP down'));
        const response = await app.inject({
            method: 'POST',
            url: '/service-orders/os-1/awaiting-approval',
        });
        expect(response.statusCode).toBe(200);
        expect(orders.get('os-1')?.status.value).toBe('AWAITING_APPROVAL');
        expect(busErrors).toHaveBeenCalledOnce();
        expect([...requests.values()][0]?.sentAt).toBeNull();
        const createdBudgetId = [...budgets.values()][0]!.id.value;
        await serviceOrder.resendBudgetApproval.execute({
            serviceOrderId: 'os-1',
            budgetId: createdBudgetId,
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
        await app.inject({
            method: 'POST',
            url: '/service-orders/os-1/awaiting-approval',
            payload: { valueCents: 12345 },
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

    it('lists an order with its associated supplies and valueCents and moves it through execution and delivery', async () => {
        const { app, orders, emails } = setup();
        const order = ServiceOrder.create({
            id: 'os-1',
            vehicleId: 'vehicle-1',
            description: 'Freios',
            valueCents: 12345,
        });
        order.addSupply('PAST-01', 2);
        order.approve();
        orders.set('os-1', order);
        const listed = await app.inject({
            method: 'GET',
            url: '/service-orders/os-1',
        });
        expect(listed.statusCode).toBe(200);
        expect(listed.json()).toEqual({
            id: 'os-1',
            vehicleId: 'vehicle-1',
            description: 'Freios',
            status: 'APPROVED',
            valueCents: 12345,
            supplies: [{ partCode: 'PAST-01', quantity: 2, used: false }],
        });
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

    it('accepts valueCents at order creation and transitions to awaiting approval without requiring an existing budget id', async () => {
        const { app, budgets } = setup();
        const created = await app.inject({
            method: 'POST',
            url: '/service-orders',
            payload: {
                description: 'Freios',
                vehicleId: 'vehicle-1',
                valueCents: 12345,
            },
        });
        expect(created.statusCode).toBe(201);
        expect(created.json().valueCents).toBe(12345);
        const orderId = created.json().id as string;

        const awaiting = await app.inject({
            method: 'POST',
            url: `/service-orders/${orderId}/awaiting-approval`,
        });
        expect(awaiting.statusCode).toBe(200);
        expect(awaiting.json().status).toBe('AWAITING_APPROVAL');
        expect([...budgets.values()][0]?.totalCents).toBe(12345);
    });

    it('returns the chronological status history with inspection value and actor once quoted', async () => {
        const { app, emails } = setup({ defaultAuthorization: undefined });
        const atendenteHeaders = { authorization: 'Bearer jwt-atendente' };
        const mecanicoHeaders = { authorization: 'Bearer jwt-mecanico' };
        const created = await app.inject({
            method: 'POST',
            url: '/service-orders',
            headers: atendenteHeaders,
            payload: { description: 'Freios', vehicleId: 'vehicle-1' },
        });
        const orderId = created.json().id as string;

        await app.inject({
            method: 'POST',
            url: `/service-orders/${orderId}/awaiting-approval`,
            headers: mecanicoHeaders,
            payload: { valueCents: 12345 },
        });
        const token = emails[0]!.text.match(
            /orcamento\/([A-Za-z0-9_-]{43})/,
        )![1]!;
        await app.inject({
            method: 'POST',
            url: '/budget-approvals/decide',
            payload: { token, decision: 'approved' },
        });
        await app.inject({
            method: 'POST',
            url: `/service-orders/${orderId}/start`,
            headers: mecanicoHeaders,
        });

        const history = await app.inject({
            method: 'GET',
            url: `/service-orders/${orderId}/history`,
            headers: atendenteHeaders,
        });
        expect(history.statusCode).toBe(200);
        expect(history.json()).toEqual({
            serviceOrderId: orderId,
            history: [
                {
                    status: 'PENDING',
                    valueCents: null,
                    changedBy: 'atendente-1',
                    recordedAt: expect.any(String),
                },
                {
                    status: 'AWAITING_APPROVAL',
                    valueCents: 12345,
                    changedBy: 'mecanico-1',
                    recordedAt: expect.any(String),
                },
                {
                    status: 'APPROVED',
                    valueCents: 12345,
                    changedBy: null,
                    recordedAt: expect.any(String),
                },
                {
                    status: 'IN_PROGRESS',
                    valueCents: 12345,
                    changedBy: 'mecanico-1',
                    recordedAt: expect.any(String),
                },
            ],
        });

        const missing = await app.inject({
            method: 'GET',
            url: '/service-orders/missing/history',
            headers: atendenteHeaders,
        });
        expect(missing.statusCode).toBe(404);
    });

    it('rejects requests without token or with invalid token with 401 Unauthorized on protected routes', async () => {
        const { app, serviceOrderRepository } = setup({
            defaultAuthorization: undefined,
        });

        for (const [method, url] of [
            ['POST', '/service-orders'],
            ['GET', '/service-orders/os-1'],
            ['GET', '/service-orders/os-1/history'],
            ['POST', '/service-orders/os-1/supplies'],
            ['POST', '/service-orders/os-1/supplies/PAST-01/usage'],
            ['POST', '/service-orders/os-1/cancel'],
            ['POST', '/service-orders/os-1/awaiting-approval'],
            ['POST', '/service-orders/os-1/start'],
            ['POST', '/service-orders/os-1/finish'],
            ['POST', '/service-orders/os-1/deliver'],
        ] as const) {
            const withoutToken = await app.inject({ method, url });
            expect(withoutToken.statusCode).toBe(401);

            const invalidToken = await app.inject({
                method,
                url,
                headers: { authorization: 'Bearer invalid-jwt' },
            });
            expect(invalidToken.statusCode).toBe(401);
        }

        expect(serviceOrderRepository.save).not.toHaveBeenCalled();
    });

    it('enforces role permissions with 403 Forbidden across service-order routes', async () => {
        const { app, orders } = setup({ defaultAuthorization: undefined });
        orders.set(
            'os-1',
            ServiceOrder.create({
                id: 'os-1',
                description: 'Freios',
                vehicleId: 'vehicle-1',
            }),
        );

        const forbiddenCases = [
            ['POST', '/service-orders', 'jwt-mecanico'],
            ['POST', '/service-orders', 'jwt-estoquista'],
            ['POST', '/service-orders/os-1/cancel', 'jwt-mecanico'],
            ['POST', '/service-orders/os-1/cancel', 'jwt-estoquista'],
            ['POST', '/service-orders/os-1/deliver', 'jwt-mecanico'],
            ['POST', '/service-orders/os-1/deliver', 'jwt-estoquista'],
            ['POST', '/service-orders/os-1/awaiting-approval', 'jwt-atendente'],
            [
                'POST',
                '/service-orders/os-1/awaiting-approval',
                'jwt-estoquista',
            ],
            ['POST', '/service-orders/os-1/start', 'jwt-atendente'],
            ['POST', '/service-orders/os-1/start', 'jwt-estoquista'],
            ['POST', '/service-orders/os-1/finish', 'jwt-atendente'],
            ['POST', '/service-orders/os-1/finish', 'jwt-estoquista'],
            ['POST', '/service-orders/os-1/supplies', 'jwt-atendente'],
            [
                'POST',
                '/service-orders/os-1/supplies/PAST-01/usage',
                'jwt-atendente',
            ],
        ] as const;

        for (const [method, url, token] of forbiddenCases) {
            const res = await app.inject({
                method,
                url,
                headers: { authorization: `Bearer ${token}` },
            });
            expect(res.statusCode).toBe(403);
        }

        const estoquistaSupply = await app.inject({
            method: 'POST',
            url: '/service-orders/os-1/supplies',
            headers: { authorization: 'Bearer jwt-estoquista' },
            payload: { partCode: 'PAST-01', quantity: 1 },
        });
        expect(estoquistaSupply.statusCode).toBe(201);

        for (const token of [
            'jwt-atendente',
            'jwt-mecanico',
            'jwt-estoquista',
            'jwt-gerente',
        ]) {
            const getOrder = await app.inject({
                method: 'GET',
                url: '/service-orders/os-1',
                headers: { authorization: `Bearer ${token}` },
            });
            expect(getOrder.statusCode).toBe(200);
        }
    });

    it('does not leave a pending budget persisted when saving the order transition fails', async () => {
        const { app, orders, budgets, serviceOrderRepository } = setup();
        orders.set(
            'os-1',
            ServiceOrder.create({
                id: 'os-1',
                description: 'Freios',
                vehicleId: 'vehicle-1',
                valueCents: 12345,
            }),
        );
        vi.mocked(serviceOrderRepository.save).mockRejectedValueOnce(
            new Error('db write failed'),
        );

        const response = await app.inject({
            method: 'POST',
            url: '/service-orders/os-1/awaiting-approval',
        });
        expect(response.statusCode).toBe(500);
        expect(budgets.size).toBe(0);
    });

    it('revokes pending links on cancel and expires an awaiting order even after 100 expired links of cancelled orders', async () => {
        const { app, orders, budgets, requests, approvals } = setup();
        const past = new Date(Date.now() - 60_000);
        const createdAt = new Date(Date.now() - 120_000);

        for (let i = 0; i < 100; i++) {
            const cancelledOrder = ServiceOrder.create({
                id: `os-cancelled-${i}`,
                description: 'Cancelada',
                vehicleId: 'vehicle-1',
            });
            cancelledOrder.awaitApproval(`budget-cancelled-${i}`);
            cancelledOrder.cancel();
            orders.set(cancelledOrder.id.value, cancelledOrder);
            requests.set(
                `hash-cancelled-${i}`,
                ApprovalRequest.create(
                    {
                        id: `req-cancelled-${i}`,
                        orderId: cancelledOrder.id.value,
                        budgetId: `budget-cancelled-${i}`,
                        budgetVersion: '1',
                        tokenHash: `hash-cancelled-${i}`,
                        expiresAt: past,
                    },
                    createdAt,
                ),
            );
        }

        const created = await app.inject({
            method: 'POST',
            url: '/service-orders',
            payload: { description: 'Freios', vehicleId: 'vehicle-1' },
        });
        const cancelledViaHttpId = created.json().id as string;
        await app.inject({
            method: 'POST',
            url: `/service-orders/${cancelledViaHttpId}/awaiting-approval`,
            payload: { valueCents: 12345 },
        });
        await app.inject({
            method: 'POST',
            url: `/service-orders/${cancelledViaHttpId}/cancel`,
        });
        const revokedReq = [...requests.values()].find(
            (r) => r.orderId === cancelledViaHttpId,
        );
        expect(revokedReq?.toPersistence().revokedAt).not.toBeNull();

        const waitingOrder = ServiceOrder.create({
            id: 'os-waiting-101',
            description: 'Aguardando',
            vehicleId: 'vehicle-1',
        });
        const waitingBudget = Budget.create({
            id: 'budget-waiting-101',
            serviceOrderId: waitingOrder.id.value,
            totalCents: 5000,
        });
        waitingOrder.awaitApproval(waitingBudget.id.value);
        orders.set(waitingOrder.id.value, waitingOrder);
        budgets.set(waitingBudget.id.value, waitingBudget);
        requests.set(
            'hash-waiting-101',
            ApprovalRequest.create(
                {
                    id: 'req-waiting-101',
                    orderId: waitingOrder.id.value,
                    budgetId: waitingBudget.id.value,
                    budgetVersion: '1',
                    tokenHash: 'hash-waiting-101',
                    expiresAt: past,
                },
                createdAt,
            ),
        );

        const expiredCount = await approvals.expirePending(new Date());
        expect(expiredCount).toBe(1);
        expect(orders.get('os-waiting-101')?.status.value).toBe('REJECTED');
        expect(budgets.get('budget-waiting-101')?.status.value).toBe(
            'REJECTED',
        );
    });
});
