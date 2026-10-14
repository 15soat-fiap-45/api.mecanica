import { describe, expect, it } from 'vitest';
import { BudgetStatus, InvalidBudgetStatusException } from './budget-status.js';

describe('BudgetStatus Value Object', () => {
    describe('Creation', () => {
        it.each(['PENDING', 'APPROVED', 'REJECTED'])(
            'should create status %s',
            (type) => {
                expect(BudgetStatus.create(type).value).toBe(type);
            },
        );

        it('should create the initial status via BudgetStatus.pending()', () => {
            expect(BudgetStatus.pending().value).toBe('PENDING');
        });

        it('should normalize lowercase input', () => {
            expect(BudgetStatus.create('approved').value).toBe('APPROVED');
        });

        it('should throw InvalidBudgetStatusException for unknown values', () => {
            expect(() => BudgetStatus.create('CANCELLED')).toThrow(
                InvalidBudgetStatusException,
            );
            expect(() => BudgetStatus.create('')).toThrow(
                InvalidBudgetStatusException,
            );
        });

        it('should return true for BudgetStatus.isValid with valid input', () => {
            expect(BudgetStatus.isValid('REJECTED')).toBe(true);
        });

        it('should return false for BudgetStatus.isValid with invalid input', () => {
            expect(BudgetStatus.isValid('CANCELLED')).toBe(false);
        });
    });

    describe('Transitions', () => {
        it('should allow PENDING -> APPROVED', () => {
            expect(BudgetStatus.pending().transitionTo('APPROVED').value).toBe(
                'APPROVED',
            );
        });

        it('should allow PENDING -> REJECTED', () => {
            expect(BudgetStatus.pending().transitionTo('REJECTED').value).toBe(
                'REJECTED',
            );
        });

        it('should reject transitions from terminal statuses', () => {
            expect(() =>
                BudgetStatus.create('APPROVED').transitionTo('PENDING'),
            ).toThrow(InvalidBudgetStatusException);
            expect(() =>
                BudgetStatus.create('REJECTED').transitionTo('APPROVED'),
            ).toThrow(InvalidBudgetStatusException);
        });

        it('should check transitions with canTransitionTo', () => {
            expect(BudgetStatus.pending().canTransitionTo('APPROVED')).toBe(
                true,
            );
            expect(
                BudgetStatus.create('APPROVED').canTransitionTo('REJECTED'),
            ).toBe(false);
        });
    });

    describe('Equality', () => {
        it('should be equal for the same status', () => {
            expect(BudgetStatus.pending().equals(BudgetStatus.pending())).toBe(
                true,
            );
        });

        it('should not be equal for different statuses or null', () => {
            expect(
                BudgetStatus.pending().equals(BudgetStatus.create('REJECTED')),
            ).toBe(false);
            expect(BudgetStatus.pending().equals(null)).toBe(false);
        });

        it('should convert to string', () => {
            expect(BudgetStatus.pending().toString()).toBe('PENDING');
        });
    });
});
