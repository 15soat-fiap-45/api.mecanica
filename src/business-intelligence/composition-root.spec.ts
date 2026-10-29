import { describe, expect, it } from 'vitest';
import { InMemoryEventBus } from '../shared/application/in-memory-event-bus.js';
import { PartCode } from '../shared/domain/part-code.js';
import { PartSupply } from '../stock/domain/part-supply/part-supply.js';
import { UnitOfMeasure } from '../stock/domain/part-supply/value-objects/unit-of-measure.js';
import { ServiceOrder } from '../service-order/domain/service-order/service-order.js';
import { ReorderPointRestockPolicy } from './domain/restock-cycle/restock-cycle-policy.js';
import { InvalidLeadTimePeriodError } from './application/use-cases/get-service-order-lead-time.js';
import type { StockMovementRecordedContract } from './application/contracts/stock-events.js';
import { businessIntelligenceCompositionRoot } from './composition-root.js';
import { InMemoryRestockCycleRepository } from './infra/persistence/in-memory-restock-cycle-repository.js';
import { InMemoryServiceOrderTimelineRepository } from './infra/persistence/in-memory-service-order-timeline-repository.js';

const at = (minutes: number) => new Date(Date.UTC(2026, 2, 1, 10, minutes));
const MINUTE = 60_000;

describe('Business Intelligence projections and use cases (via EventBus)', () => {
    const setup = (reorderPoint = 0) => {
        const bus = new InMemoryEventBus({ error: () => undefined });
        const timelineRepository = new InMemoryServiceOrderTimelineRepository();
        const restockCycleRepository = new InMemoryRestockCycleRepository();
        const bi = businessIntelligenceCompositionRoot(bus, {
            timelineRepository,
            restockCycleRepository,
            restockPolicy: new ReorderPointRestockPolicy(reorderPoint),
        });
        return { bus, timelineRepository, restockCycleRepository, bi };
    };

    it('projects service order events published on the bus and calculates the three lead-time metrics', async () => {
        const { bus, bi } = setup();

        // Order 1: registered(0) -> exec(10) -> finished(70) -> delivered(100)
        // total=60m, exec=60m, delivery=100m
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
                occurredOn: at(10),
            },
            {
                eventId: '3',
                eventName: 'service-order.finished',
                aggregateId: 'os-1',
                occurredOn: at(70),
            },
            {
                eventId: '4',
                eventName: 'service-order.delivered',
                aggregateId: 'os-1',
                occurredOn: at(100),
            },
        ]);

        // Order 2: registered(0) -> exec(20) -> finished(50) (not delivered yet)
        // total=50m, exec=30m
        await bus.publish([
            {
                eventId: '5',
                eventName: 'service-order.registered',
                aggregateId: 'os-2',
                occurredOn: at(0),
            },
            {
                eventId: '6',
                eventName: 'service-order.execution-started',
                aggregateId: 'os-2',
                occurredOn: at(20),
            },
            {
                eventId: '7',
                eventName: 'service-order.finished',
                aggregateId: 'os-2',
                occurredOn: at(50),
            },
        ]);

        // Order 3: cancelled — must not affect averages
        await bus.publish([
            {
                eventId: '8',
                eventName: 'service-order.registered',
                aggregateId: 'os-3',
                occurredOn: at(0),
            },
            {
                eventId: '9',
                eventName: 'service-order.cancelled',
                aggregateId: 'os-3',
                occurredOn: at(15),
            },
        ]);

        const result = await bi.getServiceOrderLeadTime.execute({});

        // totalLeadTime: (70 + 50) / 2 = 60 min
        expect(result.totalLeadTime).toEqual({
            count: 2,
            averageMs: 60 * MINUTE,
            minMs: 50 * MINUTE,
            maxMs: 70 * MINUTE,
        });
        // executionTime: (60 + 30) / 2 = 45 min
        expect(result.executionTime).toEqual({
            count: 2,
            averageMs: 45 * MINUTE,
            minMs: 30 * MINUTE,
            maxMs: 60 * MINUTE,
        });
        // deliveryLeadTime: only os-1 (100 min)
        expect(result.deliveryLeadTime).toEqual({
            count: 1,
            averageMs: 100 * MINUTE,
            minMs: 100 * MINUTE,
            maxMs: 100 * MINUTE,
        });
    });

    it('consumes real domain events produced by ServiceOrder aggregate methods', async () => {
        const { bus, bi } = setup();

        const order = ServiceOrder.register({
            id: 'os-real',
            description: 'Alinhamento e balanceamento',
        });
        order.approve();
        order.startExecution();
        order.finish();
        order.deliver();

        await bus.publish(order.pullEvents());

        const metrics = await bi.getServiceOrderLeadTime.execute({});
        expect(metrics.totalLeadTime.count).toBe(1);
        expect(metrics.executionTime.count).toBe(1);
        expect(metrics.deliveryLeadTime.count).toBe(1);
    });

    it('filters service order metrics by period and rejects inverted ranges', async () => {
        const { bus, bi } = setup();

        await bus.publish([
            {
                eventId: '1',
                eventName: 'service-order.registered',
                aggregateId: 'os-early',
                occurredOn: at(0),
            },
            {
                eventId: '2',
                eventName: 'service-order.finished',
                aggregateId: 'os-early',
                occurredOn: at(20),
            },
            {
                eventId: '3',
                eventName: 'service-order.registered',
                aggregateId: 'os-late',
                occurredOn: at(50),
            },
            {
                eventId: '4',
                eventName: 'service-order.finished',
                aggregateId: 'os-late',
                occurredOn: at(90),
            },
        ]);

        const filtered = await bi.getServiceOrderLeadTime.execute({
            from: at(40),
            to: at(100),
        });
        expect(filtered.totalLeadTime).toEqual({
            count: 1,
            averageMs: 40 * MINUTE,
            minMs: 40 * MINUTE,
            maxMs: 40 * MINUTE,
        });

        await expect(
            bi.getServiceOrderLeadTime.execute({ from: at(100), to: at(40) }),
        ).rejects.toThrow(InvalidLeadTimePeriodError);
    });

    it('projects restock cycles from stock.movement-recorded events', async () => {
        const { bus, bi } = setup(2); // reorderPoint = 2

        // Part A via `stock.movement-recorded` (as emitted by PartSupply):
        // 1) EXIT to 4 (above threshold: no cycle)
        // 2) EXIT to 2 (opens cycle at t=10)
        // 3) EXIT to 0 (already open: ignored)
        // 4) ENTRY to 10 at t=70 (closes cycle -> 60 min)
        const partAEvents: StockMovementRecordedContract[] = [
            {
                eventId: 'a1',
                movementId: 'a-mov-1',
                eventName: 'stock.movement-recorded',
                aggregateId: 'p-1',
                occurredOn: at(0),
                partCode: 'PAST-FREIO-01',
                movementType: 'EXIT',
                reason: 'RESERVATION',
                quantity: 1,
                quantityBefore: 5,
                quantityAfter: 4,
            },
            {
                eventId: 'a2',
                movementId: 'a-mov-2',
                eventName: 'stock.movement-recorded',
                aggregateId: 'p-1',
                occurredOn: at(10),
                partCode: 'PAST-FREIO-01',
                movementType: 'EXIT',
                reason: 'RESERVATION',
                quantity: 2,
                quantityBefore: 4,
                quantityAfter: 2,
            },
            {
                eventId: 'a3',
                movementId: 'a-mov-3',
                eventName: 'stock.movement-recorded',
                aggregateId: 'p-1',
                occurredOn: at(25),
                partCode: 'PAST-FREIO-01',
                movementType: 'EXIT',
                reason: 'RESERVATION',
                quantity: 2,
                quantityBefore: 2,
                quantityAfter: 0,
            },
            {
                eventId: 'a4',
                movementId: 'a-mov-4',
                eventName: 'stock.movement-recorded',
                aggregateId: 'p-1',
                occurredOn: at(70),
                partCode: 'PAST-FREIO-01',
                movementType: 'ENTRY',
                reason: 'PURCHASE',
                quantity: 10,
                quantityBefore: 0,
                quantityAfter: 10,
            },
        ];
        await bus.publish(partAEvents);

        // Part B via `stock.movement-recorded` with service-order and manual reasons:
        // 1) EXIT to 1 at t=20 (opens cycle)
        // 2) ENTRY with reason MANUAL at t=30 (ignored by policy)
        // 3) ENTRY with reason PURCHASE to 8 at t=50 (closes cycle -> 30 min)
        // 4) EXIT to 0 at t=80 (leaves a new open cycle)
        const movementRecordedEvents: StockMovementRecordedContract[] = [
            {
                eventId: 'm1',
                eventName: 'stock.movement-recorded',
                aggregateId: 'p-2',
                movementId: 'mov-1',
                occurredOn: at(20),
                partCode: 'OLEO-5W30',
                movementType: 'EXIT',
                reason: 'SERVICE_ORDER',
                quantity: 4,
                quantityBefore: 5,
                quantityAfter: 1,
            },
            {
                eventId: 'm2',
                eventName: 'stock.movement-recorded',
                aggregateId: 'p-2',
                movementId: 'mov-2',
                occurredOn: at(30),
                partCode: 'OLEO-5W30',
                movementType: 'ENTRY',
                reason: 'MANUAL',
                quantity: 5,
                quantityBefore: 1,
                quantityAfter: 6,
            },
            {
                eventId: 'm3',
                eventName: 'stock.movement-recorded',
                aggregateId: 'p-2',
                movementId: 'mov-3',
                occurredOn: at(50),
                partCode: 'OLEO-5W30',
                movementType: 'ENTRY',
                reason: 'PURCHASE',
                quantity: 7,
                quantityBefore: 1,
                quantityAfter: 8,
            },
            {
                eventId: 'm4',
                eventName: 'stock.movement-recorded',
                aggregateId: 'p-2',
                movementId: 'mov-4',
                occurredOn: at(80),
                partCode: 'OLEO-5W30',
                movementType: 'EXIT',
                reason: 'SERVICE_ORDER',
                quantity: 8,
                quantityBefore: 8,
                quantityAfter: 0,
            },
        ];
        await bus.publish(movementRecordedEvents);

        const report = await bi.getRestockLeadTime.execute({});

        expect(report.policy).toEqual({
            name: 'REORDER_POINT',
            reorderPoint: 2,
        });
        expect(report.overall).toEqual({
            count: 2,
            averageMs: 45 * MINUTE,
            minMs: 30 * MINUTE,
            maxMs: 60 * MINUTE,
        });
        expect(report.byPart).toEqual([
            {
                partCode: 'OLEO-5W30',
                count: 1,
                averageMs: 30 * MINUTE,
                minMs: 30 * MINUTE,
                maxMs: 30 * MINUTE,
                openCycleSince: at(80).toISOString(),
            },
            {
                partCode: 'PAST-FREIO-01',
                count: 1,
                averageMs: 60 * MINUTE,
                minMs: 60 * MINUTE,
                maxMs: 60 * MINUTE,
                openCycleSince: null,
            },
        ]);

        const onlyOil = await bi.getRestockLeadTime.execute({
            partCode: 'oleo-5w30',
        });
        expect(onlyOil.byPart).toHaveLength(1);
        expect(onlyOil.byPart[0]?.partCode).toBe('OLEO-5W30');

        await expect(
            bi.getRestockLeadTime.execute({ from: at(50), to: at(10) }),
        ).rejects.toThrow(InvalidLeadTimePeriodError);
    });

    it('consumes real StockMovementRecorded events emitted by PartSupply aggregate', async () => {
        const { bus, bi } = setup(0);

        const part = PartSupply.register({
            id: 'part-real',
            description: 'Filtro de ar',
            partCode: PartCode.create('FILT-AR-01'),
            quantity: 2,
            unitOfMeasure: UnitOfMeasure.create('UNIT'),
        });
        part.deduct(2); // reaches 0 -> opens cycle
        part.registerEntry(5); // above 0 -> closes cycle

        await bus.publish(part.pullEvents());

        const report = await bi.getRestockLeadTime.execute({});
        expect(report.overall.count).toBe(1);
        expect(report.byPart[0]?.partCode).toBe('FILT-AR-01');
        expect(report.byPart[0]?.openCycleSince).toBeNull();
    });

    it('discards the open cycle when a cancelled reservation returns the stock', async () => {
        const { bus, bi } = setup(0);

        const part = PartSupply.register({
            id: 'part-returned',
            description: 'Pastilha de freio',
            partCode: PartCode.create('PAST-FREIO-01'),
            quantity: 2,
            unitOfMeasure: UnitOfMeasure.create('UNIT'),
        });
        part.deduct(2); // reservation reaches 0 -> opens cycle
        part.registerEntry(2, 'RESERVATION_CANCELLED'); // stock comes back
        await bus.publish(part.pullEvents());

        const afterReturn = await bi.getRestockLeadTime.execute({});
        expect(afterReturn.overall.count).toBe(0);
        expect(afterReturn.byPart).toEqual([]);

        part.registerEntry(5); // a later restock has no open cycle to close
        await bus.publish(part.pullEvents());

        const afterEntry = await bi.getRestockLeadTime.execute({});
        expect(afterEntry.overall.count).toBe(0);
    });

    it('keeps the cycle open when a returned reservation does not lift the stock above the reorder point', async () => {
        const { bus, bi } = setup(3);

        const part = PartSupply.register({
            id: 'part-partial-return',
            description: 'Filtro de óleo',
            partCode: PartCode.create('FILT-OLEO-01'),
            quantity: 4,
            unitOfMeasure: UnitOfMeasure.create('UNIT'),
        });
        part.deduct(4); // 0 <= 3 -> opens cycle
        part.registerEntry(2, 'RESERVATION_CANCELLED'); // 2 <= 3 -> still short
        part.registerEntry(5); // 7 > 3 -> real restock closes the cycle
        await bus.publish(part.pullEvents());

        const report = await bi.getRestockLeadTime.execute({});
        expect(report.overall.count).toBe(1);
        expect(report.byPart[0]?.openCycleSince).toBeNull();
    });
});
