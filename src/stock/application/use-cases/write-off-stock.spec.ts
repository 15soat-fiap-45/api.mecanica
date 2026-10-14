import { describe, expect, it, vi } from 'vitest';
import type { SupplyReservationRepository } from '../../domain/supply-reservation/supply-reservation.repository.js';
import { SupplyReservation } from '../../domain/supply-reservation/supply-reservation.js';
import { WriteOffStock } from './write-off-stock.js';

describe('WriteOffStock Use Case', () => {
    const validInput = { serviceOrderId: 'os-1' };

    const makeRepository = (
        reservations: SupplyReservation[],
    ): SupplyReservationRepository => ({
        save: vi.fn().mockResolvedValue(undefined),
        findById: vi.fn().mockResolvedValue(null),
        findByPartSupplyId: vi.fn().mockResolvedValue([]),
        findByServiceOrderId: vi.fn().mockResolvedValue(reservations),
        findByServiceOrderIdAndPartSupply: vi.fn().mockResolvedValue(null),
    });

    it('should consume pending and confirmed reservations of the service order', async () => {
        const pending = SupplyReservation.create({
            id: 'res-1',
            partSupplyId: 'pec-1',
            serviceOrderId: 'os-1',
            quantity: 3,
        });
        const confirmed = SupplyReservation.create({
            id: 'res-2',
            partSupplyId: 'pec-2',
            serviceOrderId: 'os-1',
            quantity: 1,
        });
        confirmed.confirm();

        const repository = makeRepository([pending, confirmed]);
        const useCase = new WriteOffStock(repository);

        const result = await useCase.execute(validInput);

        expect(result.serviceOrderId).toBe('os-1');
        expect(result.writtenOffItems).toEqual([
            {
                reservationId: 'res-1',
                partSupplyId: 'pec-1',
                quantity: 3,
                status: 'CONSUMED',
            },
            {
                reservationId: 'res-2',
                partSupplyId: 'pec-2',
                quantity: 1,
                status: 'CONSUMED',
            },
        ]);
        expect(repository.save).toHaveBeenCalledTimes(2);
    });

    it('should be idempotent: already consumed or cancelled reservations are skipped', async () => {
        const consumed = SupplyReservation.create({
            id: 'res-1',
            partSupplyId: 'pec-1',
            serviceOrderId: 'os-1',
            quantity: 3,
        });
        consumed.confirm();
        consumed.consume();

        const cancelled = SupplyReservation.create({
            id: 'res-2',
            partSupplyId: 'pec-2',
            serviceOrderId: 'os-1',
            quantity: 1,
        });
        cancelled.cancel();

        // Simulates the second delivery of the "service order finished" event.
        const repository = makeRepository([consumed, cancelled]);
        const useCase = new WriteOffStock(repository);

        const result = await useCase.execute(validInput);

        expect(result.writtenOffItems).toEqual([]);
        expect(repository.save).not.toHaveBeenCalled();
    });

    it('should return an empty result when the service order has no reservations', async () => {
        const repository = makeRepository([]);
        const useCase = new WriteOffStock(repository);

        const result = await useCase.execute(validInput);

        expect(result).toEqual({
            serviceOrderId: 'os-1',
            writtenOffItems: [],
        });
        expect(repository.save).not.toHaveBeenCalled();
    });
});
