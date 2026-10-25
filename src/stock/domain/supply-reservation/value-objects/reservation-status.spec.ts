import { describe, expect, it } from 'vitest';
import {
    ReservationStatus,
    InvalidReservationStatusException,
} from './reservation-status.js';

describe('ReservationStatus Value Object', () => {
    describe('Creation', () => {
        it.each(['PENDING', 'CONFIRMED', 'CANCELLED', 'CONSUMED'])(
            'should create status %s',
            (type) => {
                expect(ReservationStatus.create(type).value).toBe(type);
            },
        );

        it('should create the initial status via ReservationStatus.pending()', () => {
            expect(ReservationStatus.pending().value).toBe('PENDING');
        });

        it('should normalize lowercase input', () => {
            expect(ReservationStatus.create('confirmed').value).toBe(
                'CONFIRMED',
            );
        });

        it('should throw InvalidReservationStatusException for unknown values', () => {
            expect(() => ReservationStatus.create('FINISHED')).toThrow(
                InvalidReservationStatusException,
            );
            expect(() => ReservationStatus.create('')).toThrow(
                InvalidReservationStatusException,
            );
        });

        it('should return true for ReservationStatus.isValid with valid input', () => {
            expect(ReservationStatus.isValid('PENDING')).toBe(true);
        });

        it('should return false for ReservationStatus.isValid with invalid input', () => {
            expect(ReservationStatus.isValid('FINISHED')).toBe(false);
        });
    });

    describe('Transitions', () => {
        it('should allow PENDING -> CONFIRMED', () => {
            expect(
                ReservationStatus.pending().transitionTo('CONFIRMED').value,
            ).toBe('CONFIRMED');
        });

        it('should allow PENDING -> CANCELLED', () => {
            expect(
                ReservationStatus.pending().transitionTo('CANCELLED').value,
            ).toBe('CANCELLED');
        });

        it('should allow CONFIRMED -> CONSUMED', () => {
            const confirmed =
                ReservationStatus.pending().transitionTo('CONFIRMED');
            expect(confirmed.transitionTo('CONSUMED').value).toBe('CONSUMED');
        });

        it('should allow CONFIRMED -> CANCELLED', () => {
            const confirmed =
                ReservationStatus.pending().transitionTo('CONFIRMED');
            expect(confirmed.transitionTo('CANCELLED').value).toBe('CANCELLED');
        });

        it('should reject PENDING -> CONSUMED', () => {
            expect(() =>
                ReservationStatus.pending().transitionTo('CONSUMED'),
            ).toThrow(InvalidReservationStatusException);
        });

        it('should reject transitions from terminal statuses', () => {
            const consumed = ReservationStatus.create('CONSUMED');
            const cancelled = ReservationStatus.create('CANCELLED');

            expect(() => consumed.transitionTo('PENDING')).toThrow(
                InvalidReservationStatusException,
            );
            expect(() => cancelled.transitionTo('CONFIRMED')).toThrow(
                InvalidReservationStatusException,
            );
        });

        it('should check transitions with canTransitionTo', () => {
            expect(
                ReservationStatus.pending().canTransitionTo('CONFIRMED'),
            ).toBe(true);
            expect(
                ReservationStatus.pending().canTransitionTo('CONSUMED'),
            ).toBe(false);
        });
    });

    describe('Equality', () => {
        it('should be equal for the same status', () => {
            expect(
                ReservationStatus.pending().equals(ReservationStatus.pending()),
            ).toBe(true);
        });

        it('should not be equal for different statuses or null', () => {
            expect(
                ReservationStatus.pending().equals(
                    ReservationStatus.create('CONFIRMED'),
                ),
            ).toBe(false);
            expect(ReservationStatus.pending().equals(null)).toBe(false);
        });

        it('should convert to string', () => {
            expect(ReservationStatus.pending().toString()).toBe('PENDING');
        });
    });
});
