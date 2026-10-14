import { describe, expect, it } from 'vitest';
import { SupplyReservation } from './supply-reservation.js';
import { SupplyReservationId } from './supply-reservation-id.js';
import { InvalidReservationStatusException } from './value-objects/reservation-status.js';

describe('SupplyReservation Aggregate Root', () => {
    const makeProps = (overrides = {}) => ({
        id: 'res-1',
        partSupplyId: 'pec-1',
        serviceOrderId: 'os-1',
        quantity: 2,
        ...overrides,
    });

    it('should create reservation with string or SupplyReservationId', () => {
        const reservation1 = SupplyReservation.create(makeProps());
        expect(reservation1.id.value).toBe('res-1');
        expect(reservation1.version).toBe(0);

        const customId = new SupplyReservationId('res-2');
        const reservation2 = SupplyReservation.create(
            makeProps({ id: customId }),
        );
        expect(reservation2.id.equals(customId)).toBe(true);
    });

    it('should start with PENDING status by default', () => {
        const reservation = SupplyReservation.create(makeProps());
        expect(reservation.status.value).toBe('PENDING');
    });

    it('should keep the part-supply and service order references plus the quantity', () => {
        const reservation = SupplyReservation.create(makeProps());
        expect(reservation.partSupplyId.value).toBe('pec-1');
        expect(reservation.serviceOrderId).toBe('os-1');
        expect(reservation.quantity.value).toBe(2);
    });

    it('should confirm a pending reservation', () => {
        const reservation = SupplyReservation.create(makeProps());
        reservation.confirm();
        expect(reservation.status.value).toBe('CONFIRMED');
    });

    it('should consume a confirmed reservation', () => {
        const reservation = SupplyReservation.create(makeProps());
        reservation.confirm();
        reservation.consume();
        expect(reservation.status.value).toBe('CONSUMED');
    });

    it('should cancel a pending or confirmed reservation', () => {
        const pending = SupplyReservation.create(makeProps());
        pending.cancel();
        expect(pending.status.value).toBe('CANCELLED');

        const confirmed = SupplyReservation.create(makeProps({ id: 'res-2' }));
        confirmed.confirm();
        confirmed.cancel();
        expect(confirmed.status.value).toBe('CANCELLED');
    });

    it('should reject invalid status transitions', () => {
        const reservation = SupplyReservation.create(makeProps());
        expect(() => reservation.consume()).toThrow(
            InvalidReservationStatusException,
        );

        reservation.cancel();
        expect(() => reservation.confirm()).toThrow(
            InvalidReservationStatusException,
        );
    });

    it('should compare reservations by identity using AggregateRoot.equals()', () => {
        const reservation1 = SupplyReservation.create(makeProps());
        const reservation2 = SupplyReservation.create(
            makeProps({ quantity: 5 }),
        );
        const reservation3 = SupplyReservation.create(
            makeProps({ id: 'res-99' }),
        );

        expect(reservation1.equals(reservation2)).toBe(true);
        expect(reservation1.equals(reservation3)).toBe(false);
    });
});
