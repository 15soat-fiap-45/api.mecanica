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
import type { EmailMessage } from '../../application/ports/email-sender.js';
import { z } from 'zod';

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
    const emails: EmailMessage[] = [];
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
        send: vi.fn(async (email: EmailMessage) => {
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
    it('lets a mechanic save and revise the description during evaluation, then emails it for approval', async () => {
        const { app, orders, emails, serviceOrderRepository } = setup({
            defaultAuthorization: 'Bearer jwt-mecanico',
        });
        orders.set(
            'os-1',
            ServiceOrder.create({
                id: 'os-1',
                description: 'Barulho nos freios',
                vehicleId: 'vehicle-1',
            }),
        );
        for (const description of [
            'Pastilhas desgastadas.',
            'Pastilhas e discos desgastados; substituir ambos.',
        ]) {
            const response = await app.inject({
                method: 'PATCH',
                url: '/service-orders/os-1/description',
                payload: { description: `  ${description}  ` },
            });
            expect(response.statusCode).toBe(200);
            expect(response.json()).toEqual({
                serviceOrderId: 'os-1',
                description,
            });
            expect(serviceOrderRepository.save).toHaveBeenLastCalledWith(
                orders.get('os-1'),
            );
            const found = await app.inject({
                method: 'GET',
                url: '/service-orders/os-1',
            });
            expect(found.json()).toMatchObject({
                description,
                status: 'PENDING',
            });
        }
        const response = await app.inject({
            method: 'POST',
            url: '/service-orders/os-1/awaiting-approval',
            payload: { valueCents: 35000 },
        });
        expect(response.statusCode).toBe(200);
        expect(emails[0]?.text).toContain(
            'Pastilhas e discos desgastados; substituir ambos.',
        );
    });

    it('lets a mechanic provide the description with the budget approval request', async () => {
        const { app, orders, emails } = setup({
            defaultAuthorization: 'Bearer jwt-mecanico',
        });
        orders.set(
            'os-1',
            ServiceOrder.create({
                id: 'os-1',
                description: 'Barulho',
                vehicleId: 'vehicle-1',
            }),
        );
        const response = await app.inject({
            method: 'POST',
            url: '/service-orders/os-1/awaiting-approval',
            payload: {
                valueCents: 35000,
                description: '  Substituir pastilhas.  ',
            },
        });
        expect(response.statusCode).toBe(200);
        expect(orders.get('os-1')?.description).toBe('Substituir pastilhas.');
        expect(emails[0]?.text).toContain('Substituir pastilhas.');
        const edit = await app.inject({
            method: 'PATCH',
            url: '/service-orders/os-1/description',
            payload: { description: 'Alteração após envio' },
        });
        expect(edit.statusCode).toBe(400);
        expect(orders.get('os-1')?.description).toBe('Substituir pastilhas.');
    });

    it('rejects invalid evaluation descriptions without saving or sending a budget', async () => {
        const { app, orders, serviceOrderRepository, emails, budgets } =
            setup();
        orders.set(
            'os-1',
            ServiceOrder.create({ id: 'os-1', description: 'Original' }),
        );
        for (const description of ['', ' \n ', null, 42]) {
            for (const [method, url, extra] of [
                ['PATCH', '/service-orders/os-1/description', {}],
                [
                    'POST',
                    '/service-orders/os-1/awaiting-approval',
                    { valueCents: 35000 },
                ],
            ] as const) {
                const response = await app.inject({
                    method,
                    url,
                    payload: { ...extra, description },
                });
                expect(response.statusCode).toBe(400);
            }
        }
        const missingDescription = await app.inject({
            method: 'PATCH',
            url: '/service-orders/os-1/description',
            payload: {},
        });
        expect(missingDescription.statusCode).toBe(400);
        expect(serviceOrderRepository.save).not.toHaveBeenCalled();
        expect(orders.get('os-1')?.description).toBe('Original');
        expect(emails).toHaveLength(0);
        expect(budgets.size).toBe(0);
    });

    it('returns 404 when updating the description of a missing order', async () => {
        const { app, serviceOrderRepository } = setup();
        const response = await app.inject({
            method: 'PATCH',
            url: '/service-orders/missing/description',
            payload: { description: 'Diagnóstico' },
        });
        expect(response.statusCode).toBe(404);
        expect(serviceOrderRepository.save).not.toHaveBeenCalled();
    });

    it('notifies the customer to collect the vehicle only when the service is completed', async () => {
        const { app, orders, emails, busErrors } = setup();
        const order = ServiceOrder.create({
            id: 'os-1',
            description: 'Troca de óleo',
            vehicleId: 'vehicle-1',
        });
        orders.set('os-1', order);

        const prematureFinish = await app.inject({
            method: 'POST',
            url: '/service-orders/os-1/finish',
        });
        expect(prematureFinish.statusCode).toBe(400);
        expect(emails).toHaveLength(0);

        order.approve();
        const started = await app.inject({
            method: 'POST',
            url: '/service-orders/os-1/start',
        });
        expect(started.statusCode).toBe(200);
        expect(emails).toHaveLength(0);

        const finished = await app.inject({
            method: 'POST',
            url: '/service-orders/os-1/finish',
        });
        expect(finished.statusCode).toBe(200);
        expect(finished.json()).toEqual({
            serviceOrderId: 'os-1',
            status: 'COMPLETED',
        });
        expect(orders.get('os-1')?.status.value).toBe('COMPLETED');
        expect(emails).toHaveLength(1);
        expect(emails[0]).toEqual({
            to: 'ana@example.com',
            subject: 'Veículo pronto para retirada - OS os-1',
            html: expect.stringContaining('Serviço finalizado!'),
            text: expect.stringContaining('pronto para retirada na oficina'),
        });
        expect(emails[0]?.text).toContain('Troca de óleo');
        expect(busErrors).not.toHaveBeenCalled();

        const repeatedFinish = await app.inject({
            method: 'POST',
            url: '/service-orders/os-1/finish',
        });
        expect(repeatedFinish.statusCode).toBe(400);
        expect(emails).toHaveLength(1);

        const delivered = await app.inject({
            method: 'POST',
            url: '/service-orders/os-1/deliver',
        });
        expect(delivered.statusCode).toBe(200);
        expect(emails).toHaveLength(1);
    });

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
                '/service-orders/{serviceOrderId}/description',
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

    it('publishes valid request and response examples for every JSON service order operation', async () => {
        const { app } = setup();
        const documentedSchemas: z.ZodType[] = [];
        app.addHook('onRoute', ({ schema, method }) => {
            if (
                method === 'HEAD' ||
                !schema?.tags?.some((tag) =>
                    ['Service orders', 'Budgets'].includes(tag),
                )
            )
                return;
            for (const candidate of [
                schema.body,
                ...Object.values(schema.response ?? {}),
            ]) {
                if (candidate instanceof z.ZodType)
                    documentedSchemas.push(candidate);
            }
        });
        const response = await app.inject({ method: 'GET', url: '/docs/json' });
        expect(response.statusCode).toBe(200);
        type Media = {
            example?: unknown;
            examples?: Record<string, { value: unknown }>;
            schema?: { example?: unknown };
        };
        const document = response.json<{
            paths: Record<
                string,
                Record<
                    string,
                    {
                        requestBody?: { content: Record<string, Media> };
                        responses: Record<
                            string,
                            { content?: Record<string, Media> }
                        >;
                    }
                >
            >;
        }>();
        const examplesOf = (media: Media | undefined) =>
            media?.examples
                ? Object.values(media.examples).map(({ value }) => value)
                : [media?.example ?? media?.schema?.example].filter(
                      (value) => value !== undefined,
                  );
        let operations = 0;
        let bodies = 0;
        for (const [path, methods] of Object.entries(document.paths)) {
            if (
                !path.startsWith('/service-orders') &&
                path !== '/budget-approvals/decide'
            )
                continue;
            for (const operation of Object.values(methods)) {
                operations++;
                const success =
                    operation.responses['201'] ?? operation.responses['200'];
                expect(
                    examplesOf(success?.content?.['application/json']).length,
                    path,
                ).toBeGreaterThan(0);
                if (operation.requestBody) {
                    bodies++;
                    expect(
                        examplesOf(
                            operation.requestBody.content['application/json'],
                        ).length,
                        path,
                    ).toBeGreaterThan(0);
                }
            }
        }
        expect(operations).toBe(12);
        expect(bodies).toBe(5);
        expect(documentedSchemas).toHaveLength(17);
        for (const schema of documentedSchemas) {
            const examples = schema.meta()?.examples;
            if (!Array.isArray(examples)) {
                throw new Error('Missing schema examples');
            }
            expect(examples.length).toBeGreaterThan(0);
            for (const example of examples) {
                expect(
                    schema.safeParse(example).success,
                    JSON.stringify(example),
                ).toBe(true);
            }
        }
        for (const [action, status] of [
            ['start', 'IN_PROGRESS'],
            ['finish', 'COMPLETED'],
            ['deliver', 'DELIVERED'],
        ]) {
            const operation =
                document.paths[`/service-orders/{serviceOrderId}/${action}`]
                    ?.post;
            expect(
                examplesOf(
                    operation?.responses['200']?.content?.['application/json'],
                ),
            ).toEqual([expect.objectContaining({ status })]);
        }
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
            ['PATCH', '/service-orders/os-1/description'],
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
            ['PATCH', '/service-orders/os-1/description', 'jwt-atendente'],
            ['PATCH', '/service-orders/os-1/description', 'jwt-estoquista'],
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
