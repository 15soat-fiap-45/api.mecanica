import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../../app.js';
import { InMemoryEventBus } from '../../../shared/application/in-memory-event-bus.js';
import type { DomainEvent } from '../../../shared/domain/domain-event.js';
import { serviceOrderCompositionRoot } from '../../composition-root.js';
import { ServiceOrder } from '../../domain/service-order/service-order.js';
import type { ServiceOrderRepository } from '../../domain/service-order/service-order.repository.js';
import { Budget } from '../../domain/budget/budget.js';
import type { BudgetRepository } from '../../domain/budget/budget.repository.js';

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
    const bus = new InMemoryEventBus({ error: vi.fn() });
    const events: DomainEvent[] = [];
    for (const name of [
        'registered',
        'additional-supplies-included',
        'supply-used',
        'cancelled',
        'budget-approved',
    ]) {
        bus.subscribe(`service-order.${name}`, (event) => {
            events.push(event);
        });
    }
    const serviceOrder = serviceOrderCompositionRoot(bus, {
        serviceOrderRepository,
        budgetRepository,
    });
    const app = buildApp({ serviceOrder });
    apps.push(app);
    return {
        app,
        orders,
        budgets,
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
            payload: { description: '  Troca de óleo  ', id: 'caller-id' },
        });
        expect(response.statusCode).toBe(201);
        const order = response.json();
        expect(order).toEqual({
            id: expect.any(String),
            description: 'Troca de óleo',
            status: 'PENDING',
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
        const { app, orders, budgets, events } = setup();
        const order = ServiceOrder.create({
            id: 'os-1',
            description: 'Freios',
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
            url: '/budgets/budget-1/approve',
        });
        expect(approved.statusCode).toBe(200);
        expect(approved.json()).toEqual({
            id: 'budget-1',
            serviceOrderId: 'os-1',
            totalCents: 12345,
            status: 'APPROVED',
        });
        expect(orders.get('os-1')?.status.value).toBe('APPROVED');

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
            'service-order.budget-approved',
            'service-order.supply-used',
        ]);
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
        '/budgets/missing/approve',
    ])('returns 404 for a missing resource at %s', async (url) => {
        const { app } = setup();
        const response = await app.inject({ method: 'POST', url });
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
            payload: { description: 'Freios' },
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
                '/budgets/{budgetId}/approve',
            ]),
        );
        expect(
            (await app.inject({ method: 'GET', url: '/docs/json' })).statusCode,
        ).toBe(200);
    });
});
