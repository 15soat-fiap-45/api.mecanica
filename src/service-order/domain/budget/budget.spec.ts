import { describe, expect, it } from 'vitest';
import { Budget, InvalidBudgetException } from './budget.js';
import { BudgetId } from './budget-id.js';
import { InvalidBudgetStatusException } from './value-objects/budget-status.js';

describe('Budget Aggregate Root', () => {
    const makeProps = (overrides = {}) => ({
        id: 'orc-1',
        serviceOrderId: 'os-1',
        total: 450.9,
        ...overrides,
    });

    it('should create budget with string or BudgetId', () => {
        const budget1 = Budget.create(makeProps());
        expect(budget1.id.value).toBe('orc-1');
        expect(budget1.version).toBe(0);

        const customId = new BudgetId('orc-2');
        const budget2 = Budget.create(makeProps({ id: customId }));
        expect(budget2.id.equals(customId)).toBe(true);
    });

    it('should start with PENDING status by default', () => {
        const budget = Budget.create(makeProps());
        expect(budget.status.value).toBe('PENDING');
        expect(budget.total).toBe(450.9);
        expect(budget.serviceOrderId).toBe('os-1');
    });

    it('should throw InvalidBudgetException for negative or invalid totals', () => {
        expect(() => Budget.create(makeProps({ total: -1 }))).toThrow(
            InvalidBudgetException,
        );
        expect(() => Budget.create(makeProps({ total: Number.NaN }))).toThrow(
            InvalidBudgetException,
        );
    });

    it('should approve a pending budget and record BudgetApproved', () => {
        const budget = Budget.create(makeProps());

        budget.approve();

        expect(budget.status.value).toBe('APPROVED');
        const events = budget.pullEvents();
        expect(events).toHaveLength(1);
        expect(events[0]?.eventName).toBe('service-order.budget-approved');
        expect(events[0]).toMatchObject({
            aggregateId: 'orc-1',
            serviceOrderId: 'os-1',
            total: 450.9,
        });

        expect(budget.pullEvents()).toHaveLength(0);
    });

    it('should reject a pending budget', () => {
        const budget = Budget.create(makeProps());
        budget.reject();
        expect(budget.status.value).toBe('REJECTED');
        expect(budget.pullEvents()).toHaveLength(0);
    });

    it('should not approve twice', () => {
        const budget = Budget.create(makeProps());
        budget.approve();
        expect(() => budget.approve()).toThrow(InvalidBudgetStatusException);
    });

    it('should not reject an already approved budget', () => {
        const budget = Budget.create(makeProps());
        budget.approve();
        expect(() => budget.reject()).toThrow(InvalidBudgetStatusException);
    });

    it('should compare budgets by identity using AggregateRoot.equals()', () => {
        const budget1 = Budget.create(makeProps());
        const budget2 = Budget.create(makeProps({ total: 999 }));
        const budget3 = Budget.create(makeProps({ id: 'orc-99' }));

        expect(budget1.equals(budget2)).toBe(true);
        expect(budget1.equals(budget3)).toBe(false);
    });
});
