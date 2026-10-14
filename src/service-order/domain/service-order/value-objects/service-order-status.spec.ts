import { describe, expect, it } from 'vitest';
import {
    ServiceOrderStatus,
    InvalidServiceOrderStatusException,
} from './service-order-status.js';

describe('ServiceOrderStatus Value Object', () => {
    describe('Creation', () => {
        it.each([
            'PENDING',
            'APPROVED',
            'IN_PROGRESS',
            'PAUSED',
            'COMPLETED',
            'CANCELLED',
        ])('should create status %s', (type) => {
            expect(ServiceOrderStatus.create(type).value).toBe(type);
        });

        it('should create the initial status via ServiceOrderStatus.pending()', () => {
            expect(ServiceOrderStatus.pending().value).toBe('PENDING');
        });

        it('should normalize lowercase input', () => {
            expect(ServiceOrderStatus.create('in_progress').value).toBe(
                'IN_PROGRESS',
            );
        });

        it('should throw InvalidServiceOrderStatusException for unknown values', () => {
            expect(() => ServiceOrderStatus.create('DONE')).toThrow(
                InvalidServiceOrderStatusException,
            );
            expect(() => ServiceOrderStatus.create('')).toThrow(
                InvalidServiceOrderStatusException,
            );
        });

        it('should return true for ServiceOrderStatus.isValid with valid input', () => {
            expect(ServiceOrderStatus.isValid('PAUSED')).toBe(true);
        });

        it('should return false for ServiceOrderStatus.isValid with invalid input', () => {
            expect(ServiceOrderStatus.isValid('DONE')).toBe(false);
        });
    });

    describe('Transitions', () => {
        it('should allow PENDING -> APPROVED', () => {
            expect(
                ServiceOrderStatus.pending().transitionTo('APPROVED').value,
            ).toBe('APPROVED');
        });

        it('should allow APPROVED -> IN_PROGRESS', () => {
            const approved =
                ServiceOrderStatus.pending().transitionTo('APPROVED');
            expect(approved.transitionTo('IN_PROGRESS').value).toBe(
                'IN_PROGRESS',
            );
        });

        it('should allow IN_PROGRESS -> PAUSED and PAUSED -> IN_PROGRESS', () => {
            const inProgress = ServiceOrderStatus.create('IN_PROGRESS');
            const paused = inProgress.transitionTo('PAUSED');
            expect(paused.value).toBe('PAUSED');
            expect(paused.transitionTo('IN_PROGRESS').value).toBe(
                'IN_PROGRESS',
            );
        });

        it('should allow IN_PROGRESS -> COMPLETED', () => {
            expect(
                ServiceOrderStatus.create('IN_PROGRESS').transitionTo(
                    'COMPLETED',
                ).value,
            ).toBe('COMPLETED');
        });

        it('should allow cancellation from non-terminal statuses', () => {
            for (const from of [
                'PENDING',
                'APPROVED',
                'IN_PROGRESS',
                'PAUSED',
            ] as const) {
                expect(
                    ServiceOrderStatus.create(from).transitionTo('CANCELLED')
                        .value,
                ).toBe('CANCELLED');
            }
        });

        it('should reject PENDING -> IN_PROGRESS', () => {
            expect(() =>
                ServiceOrderStatus.pending().transitionTo('IN_PROGRESS'),
            ).toThrow(InvalidServiceOrderStatusException);
        });

        it('should reject transitions from terminal statuses', () => {
            expect(() =>
                ServiceOrderStatus.create('COMPLETED').transitionTo('PAUSED'),
            ).toThrow(InvalidServiceOrderStatusException);
            expect(() =>
                ServiceOrderStatus.create('CANCELLED').transitionTo('PENDING'),
            ).toThrow(InvalidServiceOrderStatusException);
        });

        it('should check transitions with canTransitionTo', () => {
            expect(
                ServiceOrderStatus.pending().canTransitionTo('APPROVED'),
            ).toBe(true);
            expect(
                ServiceOrderStatus.pending().canTransitionTo('COMPLETED'),
            ).toBe(false);
        });
    });

    describe('Equality', () => {
        it('should be equal for the same status', () => {
            expect(
                ServiceOrderStatus.pending().equals(
                    ServiceOrderStatus.pending(),
                ),
            ).toBe(true);
        });

        it('should not be equal for different statuses or null', () => {
            expect(
                ServiceOrderStatus.pending().equals(
                    ServiceOrderStatus.create('APPROVED'),
                ),
            ).toBe(false);
            expect(ServiceOrderStatus.pending().equals(null)).toBe(false);
        });

        it('should convert to string', () => {
            expect(ServiceOrderStatus.pending().toString()).toBe('PENDING');
        });
    });
});
