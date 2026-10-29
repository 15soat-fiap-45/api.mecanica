import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../../app.js';
import type { RoleValue } from '../../../auth/domain/user/value-objects/role.js';
import { TokenBiAccessGuard } from '../../../infra/token-bi-access-guard.js';
import { InMemoryEventBus } from '../../../shared/application/in-memory-event-bus.js';
import type { StockMovementRecordedContract } from '../../application/contracts/stock-events.js';
import { businessIntelligenceCompositionRoot } from '../../composition-root.js';
import { InMemoryRestockCycleRepository } from '../persistence/in-memory-restock-cycle-repository.js';
import { InMemoryServiceOrderTimelineRepository } from '../persistence/in-memory-service-order-timeline-repository.js';

vi.mock('../../../infra/database/connection.js', () => ({
    db: {},
    pool: { end: vi.fn() },
}));

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
});

const at = (minutes: number) => new Date(Date.UTC(2026, 4, 1, 8, minutes));
const MINUTE = 60_000;

const tokenRoles: Record<string, RoleValue> = {
    'manager-token': 'GERENTE',
    'mechanic-token': 'MECANICO',
    'attendant-token': 'ATENDENTE',
    'stock-token': 'ESTOQUISTA',
};

const makeGuard = () =>
    new TokenBiAccessGuard({
        verify: async (token: string) => {
            const role = tokenRoles[token];
            return role ? { id: `user-${role}`, role } : null;
        },
    });

describe('Business Intelligence HTTP routes', () => {
    const setupApp = (withGuard = true) => {
        const bus = new InMemoryEventBus({ error: () => undefined });
        const businessIntelligence = businessIntelligenceCompositionRoot(bus, {
            timelineRepository: new InMemoryServiceOrderTimelineRepository(),
            restockCycleRepository: new InMemoryRestockCycleRepository(),
            accessGuard: withGuard ? makeGuard() : undefined,
        });
        const app = buildApp({ businessIntelligence });
        apps.push(app);
        return { app, bus };
    };

    it('rejects unauthenticated requests with 401', async () => {
        const { app } = setupApp();

        for (const url of [
            '/bi/service-orders/lead-time',
            '/bi/stock/restock-lead-time',
        ]) {
            const noHeader = await app.inject({ method: 'GET', url });
            expect(noHeader.statusCode).toBe(401);

            const badToken = await app.inject({
                method: 'GET',
                url,
                headers: { authorization: 'Bearer invalid-token' },
            });
            expect(badToken.statusCode).toBe(401);
        }

        const { app: unguardedApp } = setupApp(false);
        const res = await unguardedApp.inject({
            method: 'GET',
            url: '/bi/service-orders/lead-time',
            headers: { authorization: 'Bearer manager-token' },
        });
        expect(res.statusCode).toBe(401);
    });

    it('rejects authenticated users without BI_VISUALIZAR permission with 403', async () => {
        const { app } = setupApp();

        for (const token of [
            'mechanic-token',
            'attendant-token',
            'stock-token',
        ]) {
            const res = await app.inject({
                method: 'GET',
                url: '/bi/service-orders/lead-time',
                headers: { authorization: `Bearer ${token}` },
            });
            expect(res.statusCode).toBe(403);
        }
    });

    it('returns service order lead-time metrics for GERENTE and validates query parameters', async () => {
        const { app, bus } = setupApp();

        await bus.publish([
            {
                eventId: '1',
                eventName: 'service-order.registered',
                aggregateId: 'os-1',
                occurredOn: at(0),
            },
            {
                eventId: '2',
                eventName: 'service-order.execution-started',
                aggregateId: 'os-1',
                occurredOn: at(15),
            },
            {
                eventId: '3',
                eventName: 'service-order.finished',
                aggregateId: 'os-1',
                occurredOn: at(45),
            },
            {
                eventId: '4',
                eventName: 'service-order.delivered',
                aggregateId: 'os-1',
                occurredOn: at(60),
            },
        ]);

        const ok = await app.inject({
            method: 'GET',
            url: `/bi/service-orders/lead-time?from=${at(0).toISOString()}&to=${at(120).toISOString()}`,
            headers: { authorization: 'Bearer manager-token' },
        });
        expect(ok.statusCode).toBe(200);
        expect(ok.json()).toEqual({
            period: {
                from: at(0).toISOString(),
                to: at(120).toISOString(),
            },
            totalLeadTime: {
                count: 1,
                averageMs: 45 * MINUTE,
                minMs: 45 * MINUTE,
                maxMs: 45 * MINUTE,
            },
            executionTime: {
                count: 1,
                averageMs: 30 * MINUTE,
                minMs: 30 * MINUTE,
                maxMs: 30 * MINUTE,
            },
            deliveryLeadTime: {
                count: 1,
                averageMs: 60 * MINUTE,
                minMs: 60 * MINUTE,
                maxMs: 60 * MINUTE,
            },
        });

        const invalidDate = await app.inject({
            method: 'GET',
            url: '/bi/service-orders/lead-time?from=not-a-date',
            headers: { authorization: 'Bearer manager-token' },
        });
        expect(invalidDate.statusCode).toBe(400);

        const invertedPeriod = await app.inject({
            method: 'GET',
            url: `/bi/service-orders/lead-time?from=${at(60).toISOString()}&to=${at(0).toISOString()}`,
            headers: { authorization: 'Bearer manager-token' },
        });
        expect(invertedPeriod.statusCode).toBe(400);
    });

    it('returns restock lead-time metrics for GERENTE and validates partCode', async () => {
        const { app, bus } = setupApp();

        const stockEvents: StockMovementRecordedContract[] = [
            {
                eventId: 's1',
                movementId: 'mov-1',
                eventName: 'stock.movement-recorded',
                aggregateId: 'part-1',
                occurredOn: at(0),
                partCode: 'PAST-FREIO-01',
                movementType: 'EXIT',
                reason: 'RESERVATION',
                quantity: 2,
                quantityBefore: 2,
                quantityAfter: 0,
            },
            {
                eventId: 's2',
                movementId: 'mov-2',
                eventName: 'stock.movement-recorded',
                aggregateId: 'part-1',
                occurredOn: at(90),
                partCode: 'PAST-FREIO-01',
                movementType: 'ENTRY',
                reason: 'PURCHASE',
                quantity: 10,
                quantityBefore: 0,
                quantityAfter: 10,
            },
        ];
        await bus.publish(stockEvents);

        const ok = await app.inject({
            method: 'GET',
            url: '/bi/stock/restock-lead-time?partCode=PAST-FREIO-01',
            headers: { authorization: 'Bearer manager-token' },
        });
        expect(ok.statusCode).toBe(200);
        expect(ok.json()).toEqual({
            period: { from: null, to: null },
            policy: { name: 'REORDER_POINT', reorderPoint: 0 },
            overall: {
                count: 1,
                averageMs: 90 * MINUTE,
                minMs: 90 * MINUTE,
                maxMs: 90 * MINUTE,
            },
            byPart: [
                {
                    partCode: 'PAST-FREIO-01',
                    count: 1,
                    averageMs: 90 * MINUTE,
                    minMs: 90 * MINUTE,
                    maxMs: 90 * MINUTE,
                    openCycleSince: null,
                },
            ],
        });

        const invalidPart = await app.inject({
            method: 'GET',
            url: '/bi/stock/restock-lead-time?partCode=ab',
            headers: { authorization: 'Bearer manager-token' },
        });
        expect(invalidPart.statusCode).toBe(400);
    });
});
