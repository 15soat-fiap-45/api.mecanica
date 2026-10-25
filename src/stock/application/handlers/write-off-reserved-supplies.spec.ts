import { describe, expect, it, vi } from 'vitest';
import type { SupplyReservationRepository } from '../../domain/supply-reservation/supply-reservation.repository.js';
import { SupplyReservation } from '../../domain/supply-reservation/supply-reservation.js';
import { WriteOffStock } from '../use-cases/write-off-stock.js';
import {
    WriteOffReservedSupplies,
    type ServiceOrderFinished,
} from './write-off-reserved-supplies.js';

describe('WriteOffReservedSupplies Handler', () => {
    const makeEvent = (): ServiceOrderFinished => ({
        eventId: 'evt-1',
        eventName: 'service-order.finished',
        occurredOn: new Date(),
        aggregateId: 'os-1',
    });

    const makeRepository = (
        reservations: SupplyReservation[],
    ): SupplyReservationRepository => ({
        save: vi.fn().mockResolvedValue(undefined),
        findById: vi.fn().mockResolvedValue(null),
        findByPartSupplyId: vi.fn().mockResolvedValue([]),
        findByServiceOrderId: vi.fn().mockResolvedValue(reservations),
        findByServiceOrderIdAndPartSupply: vi.fn().mockResolvedValue(null),
    });

    it('should consume the service order reservations through the WriteOffStock use case', async () => {
        const reservation = SupplyReservation.create({
            id: 'res-1',
            partSupplyId: 'pec-1',
            serviceOrderId: 'os-1',
            quantity: 2,
        });
        const repository = makeRepository([reservation]);
        const handler = new WriteOffReservedSupplies(
            new WriteOffStock(repository),
        );

        await handler.handle(makeEvent());

        expect(reservation.status.value).toBe('CONSUMED');
        expect(repository.save).toHaveBeenCalledTimes(1);
        expect(repository.findByServiceOrderId).toHaveBeenCalledWith('os-1');
    });

    it('should be idempotent: a duplicated service order finished event has no side effects', async () => {
        const reservation = SupplyReservation.create({
            id: 'res-1',
            partSupplyId: 'pec-1',
            serviceOrderId: 'os-1',
            quantity: 2,
        });
        const repository = makeRepository([reservation]);
        const handler = new WriteOffReservedSupplies(
            new WriteOffStock(repository),
        );

        await handler.handle(makeEvent());
        await handler.handle(makeEvent());

        expect(reservation.status.value).toBe('CONSUMED');
        // save only on the first delivery
        expect(repository.save).toHaveBeenCalledTimes(1);
    });

    it('should do nothing when the service order has no reservations', async () => {
        const repository = makeRepository([]);
        const handler = new WriteOffReservedSupplies(
            new WriteOffStock(repository),
        );

        await expect(handler.handle(makeEvent())).resolves.toBeUndefined();
        expect(repository.save).not.toHaveBeenCalled();
    });
});
