import { describe, expect, it, vi } from 'vitest';
import type { PartSupplyRepository } from '../../domain/part-supply/part-supply.repository.js';
import type { SupplyReservationRepository } from '../../domain/supply-reservation/supply-reservation.repository.js';
import { SupplyReservation } from '../../domain/supply-reservation/supply-reservation.js';
import { PartSupply } from '../../domain/part-supply/part-supply.js';
import { PartCode } from '../../../shared/domain/part-code.js';
import { UnitOfMeasure } from '../../domain/part-supply/value-objects/unit-of-measure.js';
import { CancelReservation } from '../use-cases/cancel-reservation.js';
import {
    ReleaseReservedSupplies,
    type ServiceOrderCancelled,
} from './release-reserved-supplies.js';

describe('ReleaseReservedSupplies Handler', () => {
    const makeEvent = (): ServiceOrderCancelled => ({
        eventId: 'evt-1',
        eventName: 'service-order.cancelled',
        occurredOn: new Date(),
        aggregateId: 'os-1',
    });

    const makePart = (quantity: number): PartSupply =>
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
        findById: vi.fn().mockResolvedValue(part),
        findByPartCode: vi.fn().mockResolvedValue(null),
    });

    const makeReservationRepository = (
        reservations: SupplyReservation[],
    ): SupplyReservationRepository => ({
        save: vi.fn().mockResolvedValue(undefined),
        findById: vi.fn().mockResolvedValue(null),
        findByPartSupplyId: vi.fn().mockResolvedValue([]),
        findByServiceOrderId: vi.fn().mockResolvedValue(reservations),
        findByServiceOrderIdAndPartSupply: vi.fn().mockResolvedValue(null),
    });

    it('should cancel the reservation and give the stock back when the order is cancelled', async () => {
        const part = makePart(6); // 10 - 4 reserved
        const reservation = SupplyReservation.create({
            id: 'res-1',
            partSupplyId: 'pec-1',
            serviceOrderId: 'os-1',
            quantity: 4,
        });
        const partRepository = makePartRepository(part);
        const reservationRepository = makeReservationRepository([reservation]);
        const handler = new ReleaseReservedSupplies(
            new CancelReservation(partRepository, reservationRepository),
        );

        await handler.handle(makeEvent());

        expect(reservation.status.value).toBe('CANCELLED');
        expect(part.quantity.value).toBe(10);
        expect(reservationRepository.save).toHaveBeenCalledTimes(1);
        expect(reservationRepository.findByServiceOrderId).toHaveBeenCalledWith(
            'os-1',
        );
    });

    it('should be idempotent: a duplicated cancelled event does not return the stock twice', async () => {
        const part = makePart(6);
        const reservation = SupplyReservation.create({
            id: 'res-1',
            partSupplyId: 'pec-1',
            serviceOrderId: 'os-1',
            quantity: 4,
        });
        const partRepository = makePartRepository(part);
        const reservationRepository = makeReservationRepository([reservation]);
        const handler = new ReleaseReservedSupplies(
            new CancelReservation(partRepository, reservationRepository),
        );

        await handler.handle(makeEvent());
        await handler.handle(makeEvent());

        expect(reservation.status.value).toBe('CANCELLED');
        expect(part.quantity.value).toBe(10); // not 14
        expect(reservationRepository.save).toHaveBeenCalledTimes(1);
    });
});
