import { describe, expect, it, vi } from 'vitest';
import type { PartSupplyRepository } from '../../domain/part-supply/part-supply.repository.js';
import type { SupplyReservationRepository } from '../../domain/supply-reservation/supply-reservation.repository.js';
import type { SupplyReservation } from '../../domain/supply-reservation/supply-reservation.js';
import { PartSupply } from '../../domain/part-supply/part-supply.js';
import { PartCode } from '../../../shared/domain/part-code.js';
import { UnitOfMeasure } from '../../domain/part-supply/value-objects/unit-of-measure.js';
import { SupplyReservation as Reservation } from '../../domain/supply-reservation/supply-reservation.js';
import { PartSupplyNotFoundError } from '../use-cases/reserve-supply.js';
import { ConsumeUsedSupply, type SupplyUsed } from './consume-used-supply.js';

describe('ConsumeUsedSupply Handler', () => {
    const makeEvent = (): SupplyUsed => ({
        eventId: 'evt-1',
        eventName: 'service-order.supply-used',
        occurredOn: new Date(),
        aggregateId: 'os-1',
        partCode: 'PAST-FREIO-01',
        quantity: 4,
    });

    const makePart = (): PartSupply =>
        PartSupply.create({
            id: 'pec-1',
            description: 'Front brake pad',
            partCode: PartCode.create('PAST-FREIO-01'),
            quantity: 6,
            unitOfMeasure: UnitOfMeasure.create('UNIT'),
        });

    const makeReservation = (): SupplyReservation =>
        Reservation.create({
            id: 'res-1',
            partSupplyId: 'pec-1',
            serviceOrderId: 'os-1',
            quantity: 4,
        });

    const makePartRepository = (
        part: PartSupply | null = makePart(),
    ): PartSupplyRepository => ({
        save: vi.fn().mockResolvedValue(undefined),
        findById: vi.fn().mockResolvedValue(part),
        findByPartCode: vi.fn().mockResolvedValue(part),
    });

    const makeReservationRepository = (
        reservation: SupplyReservation | null,
    ): SupplyReservationRepository => ({
        save: vi.fn().mockResolvedValue(undefined),
        findById: vi.fn().mockResolvedValue(null),
        findByPartSupplyId: vi.fn().mockResolvedValue([]),
        findByServiceOrderId: vi.fn().mockResolvedValue([]),
        findByServiceOrderIdAndPartSupply: vi
            .fn()
            .mockResolvedValue(reservation),
    });

    it('should consume the reservation when the mechanic marks the supply as used', async () => {
        const part = makePart();
        const partRepository = makePartRepository(part);
        const reservation = makeReservation();
        const reservationRepository = makeReservationRepository(reservation);
        const handler = new ConsumeUsedSupply(
            partRepository,
            reservationRepository,
        );

        await handler.handle(makeEvent());

        expect(reservation.status.value).toBe('CONSUMED');
        expect(reservationRepository.save).toHaveBeenCalledTimes(1);
        // stock quantity is untouched: it already left the shelf at
        // reserve time — consuming only finalizes the reservation
        expect(part.quantity.value).toBe(6);
        expect(partRepository.save).not.toHaveBeenCalled();
    });

    it('should consume a CONFIRMED reservation as well', async () => {
        const reservation = makeReservation();
        reservation.confirm();
        const reservationRepository = makeReservationRepository(reservation);
        const handler = new ConsumeUsedSupply(
            makePartRepository(),
            reservationRepository,
        );

        await handler.handle(makeEvent());

        expect(reservation.status.value).toBe('CONSUMED');
        expect(reservationRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should be idempotent: a duplicated event does not save again', async () => {
        const reservation = makeReservation();
        const reservationRepository = makeReservationRepository(reservation);
        const handler = new ConsumeUsedSupply(
            makePartRepository(),
            reservationRepository,
        );

        await handler.handle(makeEvent());
        await handler.handle(makeEvent());

        expect(reservation.status.value).toBe('CONSUMED');
        expect(reservationRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should do nothing when the order has no reservation for the part (awaiting replenishment)', async () => {
        const reservationRepository = makeReservationRepository(null);
        const handler = new ConsumeUsedSupply(
            makePartRepository(),
            reservationRepository,
        );

        await handler.handle(makeEvent());

        expect(reservationRepository.save).not.toHaveBeenCalled();
    });

    it('should throw PartSupplyNotFoundError when the part does not exist', async () => {
        const reservationRepository = makeReservationRepository(null);
        const handler = new ConsumeUsedSupply(
            makePartRepository(null),
            reservationRepository,
        );

        await expect(handler.handle(makeEvent())).rejects.toThrow(
            PartSupplyNotFoundError,
        );
        expect(reservationRepository.save).not.toHaveBeenCalled();
    });
});
