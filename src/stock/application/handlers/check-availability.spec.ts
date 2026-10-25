import { describe, expect, it, vi } from 'vitest';
import type { PartSupplyRepository } from '../../domain/part-supply/part-supply.repository.js';
import type { SupplyReservationRepository } from '../../domain/supply-reservation/supply-reservation.repository.js';
import type { SupplyReservation } from '../../domain/supply-reservation/supply-reservation.js';
import { PartSupply } from '../../domain/part-supply/part-supply.js';
import { PartCode } from '../../../shared/domain/part-code.js';
import { UnitOfMeasure } from '../../domain/part-supply/value-objects/unit-of-measure.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import { ReserveSupply } from '../use-cases/reserve-supply.js';
import {
    CheckAvailability,
    type AdditionalSuppliesIncluded,
} from './check-availability.js';

describe('CheckAvailability Handler', () => {
    const makeEvent = (
        items: AdditionalSuppliesIncluded['items'],
    ): AdditionalSuppliesIncluded => ({
        eventId: 'evt-1',
        eventName: 'service-order.additional-supplies-included',
        occurredOn: new Date(),
        aggregateId: 'os-1',
        items,
    });

    const makePart = (quantity = 10): PartSupply =>
        PartSupply.create({
            id: 'pec-1',
            description: 'Front brake pad',
            partCode: PartCode.create('PAST-FREIO-01'),
            quantity,
            unitOfMeasure: UnitOfMeasure.create('UNIT'),
        });

    const makePartRepository = (
        part: PartSupply | null,
    ): PartSupplyRepository => ({
        save: vi.fn().mockResolvedValue(undefined),
        findById: vi.fn().mockResolvedValue(null),
        findByPartCode: vi.fn().mockResolvedValue(part),
    });

    const makeReservationRepository = (
        existingReservation: SupplyReservation | null = null,
    ): SupplyReservationRepository => ({
        save: vi.fn().mockResolvedValue(undefined),
        findById: vi.fn().mockResolvedValue(null),
        findByPartSupplyId: vi.fn().mockResolvedValue([]),
        findByServiceOrderId: vi.fn().mockResolvedValue([]),
        findByServiceOrderIdAndPartSupply: vi
            .fn()
            .mockResolvedValue(existingReservation),
    });

    const makeEventBus = (): EventBus => ({
        publish: vi.fn().mockResolvedValue(undefined),
        subscribe: vi.fn(),
    });

    const makeHandler = (
        part: PartSupply | null,
        existingReservation: SupplyReservation | null = null,
    ) => {
        const partRepository = makePartRepository(part);
        const reservationRepository =
            makeReservationRepository(existingReservation);
        const eventBus = makeEventBus();
        const reserveSupply = new ReserveSupply(
            partRepository,
            reservationRepository,
            eventBus,
        );
        const handler = new CheckAvailability(reserveSupply, eventBus);
        return { handler, partRepository, reservationRepository, eventBus };
    };

    it('should reserve every item when stock is available', async () => {
        const part = makePart();
        const { handler, reservationRepository, eventBus } = makeHandler(part);

        await handler.handle(
            makeEvent([{ partCode: 'PAST-FREIO-01', quantity: 2 }]),
        );

        expect(part.quantity.value).toBe(8);
        expect(reservationRepository.save).toHaveBeenCalledTimes(1);
        // no AwaitingReplenishment was published
        for (const call of vi.mocked(eventBus.publish).mock.calls) {
            const published = Array.isArray(call[0]) ? call[0] : [call[0]];
            for (const domainEvent of published) {
                expect(domainEvent.eventName).not.toBe(
                    'stock.awaiting-replenishment',
                );
            }
        }
    });

    it('should publish AwaitingReplenishment when the part does not exist', async () => {
        const { handler, reservationRepository, eventBus } = makeHandler(null);

        await handler.handle(
            makeEvent([{ partCode: 'PAST-FREIO-01', quantity: 2 }]),
        );

        expect(reservationRepository.save).not.toHaveBeenCalled();
        expect(eventBus.publish).toHaveBeenCalledTimes(1);
        expect(eventBus.publish).toHaveBeenCalledWith(
            expect.objectContaining({
                eventName: 'stock.awaiting-replenishment',
                aggregateId: 'os-1',
                pendingItems: [
                    { partCode: 'PAST-FREIO-01', requestedQuantity: 2 },
                ],
            }),
        );
    });

    it('should publish AwaitingReplenishment when stock is not enough', async () => {
        const part = makePart(1);
        const { handler, reservationRepository, eventBus } = makeHandler(part);

        await handler.handle(
            makeEvent([{ partCode: 'PAST-FREIO-01', quantity: 5 }]),
        );

        // stock is unchanged and no reservation is created
        expect(part.quantity.value).toBe(1);
        expect(reservationRepository.save).not.toHaveBeenCalled();
        expect(eventBus.publish).toHaveBeenCalledWith(
            expect.objectContaining({
                eventName: 'stock.awaiting-replenishment',
                pendingItems: [
                    { partCode: 'PAST-FREIO-01', requestedQuantity: 5 },
                ],
            }),
        );
    });

    it('should be idempotent: handling the same event twice does not reserve twice', async () => {
        const part = makePart();
        const { handler, reservationRepository } = makeHandler(part);

        const event = makeEvent([{ partCode: 'PAST-FREIO-01', quantity: 3 }]);
        await handler.handle(event);

        // Second delivery: the persisted reservation is found by the
        // service order + supply key.
        vi.mocked(
            reservationRepository.findByServiceOrderIdAndPartSupply,
        ).mockResolvedValue(
            // the only reservation saved on the first run
            vi.mocked(reservationRepository.save).mock
                .calls[0]?.[0] as SupplyReservation,
        );
        await handler.handle(event);

        expect(reservationRepository.save).toHaveBeenCalledTimes(1);
        expect(part.quantity.value).toBe(7);
    });

    it('should rethrow unexpected errors', async () => {
        const part = makePart();
        const partRepository = makePartRepository(part);
        vi.mocked(partRepository.save).mockRejectedValue(new Error('db down'));
        const reservationRepository = makeReservationRepository();
        const eventBus = makeEventBus();
        const handler = new CheckAvailability(
            new ReserveSupply(partRepository, reservationRepository, eventBus),
            eventBus,
        );

        await expect(
            handler.handle(
                makeEvent([{ partCode: 'PAST-FREIO-01', quantity: 2 }]),
            ),
        ).rejects.toThrow('db down');
    });
});
