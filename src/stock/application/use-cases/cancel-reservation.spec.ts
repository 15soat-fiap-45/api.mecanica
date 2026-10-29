import { describe, expect, it, vi } from 'vitest';
import type { PartSupplyRepository } from '../../domain/part-supply/part-supply.repository.js';
import type { SupplyReservationRepository } from '../../domain/supply-reservation/supply-reservation.repository.js';
import { SupplyReservation } from '../../domain/supply-reservation/supply-reservation.js';
import { PartSupply } from '../../domain/part-supply/part-supply.js';
import { PartCode } from '../../../shared/domain/part-code.js';
import { UnitOfMeasure } from '../../domain/part-supply/value-objects/unit-of-measure.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import { CancelReservation } from './cancel-reservation.js';
import { PartSupplyNotFoundError } from './reserve-supply.js';

describe('CancelReservation Use Case', () => {
    const makePart = (quantity = 6): PartSupply =>
        PartSupply.create({
            id: 'pec-1',
            description: 'Front brake pad',
            partCode: PartCode.create('PAST-FREIO-01'),
            quantity,
            unitOfMeasure: UnitOfMeasure.create('UNIT'),
        });

    const makeReservation = (overrides = {}): SupplyReservation =>
        SupplyReservation.create({
            id: 'res-1',
            partSupplyId: 'pec-1',
            serviceOrderId: 'os-1',
            quantity: 4,
            ...overrides,
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

    const makeEventBus = (): EventBus => ({
        publish: vi.fn().mockResolvedValue(undefined),
        subscribe: vi.fn(),
    });

    it('should cancel the reservation and give the quantity back to the stock', async () => {
        const part = makePart(6); // 10 - 4 reserved
        const reservation = makeReservation();
        const partRepository = makePartRepository(part);
        const reservationRepository = makeReservationRepository([reservation]);
        const eventBus = makeEventBus();
        const useCase = new CancelReservation(
            partRepository,
            reservationRepository,
            eventBus,
        );

        const result = await useCase.execute({ serviceOrderId: 'os-1' });

        expect(reservation.status.value).toBe('CANCELLED');
        expect(part.quantity.value).toBe(10);
        expect(result.cancelledItems).toEqual([
            {
                reservationId: 'res-1',
                partSupplyId: 'pec-1',
                quantity: 4,
                status: 'CANCELLED',
            },
        ]);
        expect(partRepository.save).toHaveBeenCalledTimes(1);
        expect(reservationRepository.save).toHaveBeenCalledTimes(1);
        expect(eventBus.publish).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    eventName: 'stock.stock-updated',
                    movementType: 'ENTRY',
                    reason: 'RESERVATION_CANCELLED',
                    movedQuantity: 4,
                    previousQuantity: 6,
                    currentQuantity: 10,
                }),
            ]),
        );
    });

    it('should cancel a CONFIRMED reservation as well', async () => {
        const part = makePart(6);
        const reservation = makeReservation();
        reservation.confirm();
        const useCase = new CancelReservation(
            makePartRepository(part),
            makeReservationRepository([reservation]),
        );

        await useCase.execute({ serviceOrderId: 'os-1' });

        expect(reservation.status.value).toBe('CANCELLED');
        expect(part.quantity.value).toBe(10);
    });

    it('should be idempotent: already cancelled reservations do not return the stock twice', async () => {
        const part = makePart(10); // stock already returned
        const reservation = makeReservation();
        reservation.cancel();
        const partRepository = makePartRepository(part);
        const reservationRepository = makeReservationRepository([reservation]);
        const useCase = new CancelReservation(
            partRepository,
            reservationRepository,
        );

        const result = await useCase.execute({ serviceOrderId: 'os-1' });

        expect(result.cancelledItems).toHaveLength(0);
        expect(part.quantity.value).toBe(10);
        expect(partRepository.save).not.toHaveBeenCalled();
        expect(reservationRepository.save).not.toHaveBeenCalled();
    });

    it('should skip CONSUMED reservations (stock already written off)', async () => {
        const part = makePart(6);
        const reservation = makeReservation();
        reservation.confirm();
        reservation.consume();
        const partRepository = makePartRepository(part);
        const reservationRepository = makeReservationRepository([reservation]);
        const useCase = new CancelReservation(
            partRepository,
            reservationRepository,
        );

        const result = await useCase.execute({ serviceOrderId: 'os-1' });

        expect(result.cancelledItems).toHaveLength(0);
        expect(part.quantity.value).toBe(6);
        expect(reservationRepository.save).not.toHaveBeenCalled();
    });

    it('should throw PartSupplyNotFoundError when the reserved part does not exist (fails loudly instead of skipping)', async () => {
        const reservation = makeReservation();
        const partRepository = makePartRepository(null);
        const reservationRepository = makeReservationRepository([reservation]);
        const useCase = new CancelReservation(
            partRepository,
            reservationRepository,
        );

        await expect(
            useCase.execute({ serviceOrderId: 'os-1' }),
        ).rejects.toThrow(PartSupplyNotFoundError);
        // nothing is saved: the reservation stays open so a redelivery
        // after the data is fixed completes the job
        expect(reservation.status.value).toBe('PENDING');
        expect(partRepository.save).not.toHaveBeenCalled();
        expect(reservationRepository.save).not.toHaveBeenCalled();
    });

    it('should do nothing when the order has no reservations', async () => {
        const reservationRepository = makeReservationRepository([]);
        const useCase = new CancelReservation(
            makePartRepository(makePart()),
            reservationRepository,
        );

        const result = await useCase.execute({ serviceOrderId: 'os-1' });

        expect(result.cancelledItems).toHaveLength(0);
        expect(reservationRepository.save).not.toHaveBeenCalled();
    });
});
