import { describe, expect, it, vi } from 'vitest';
import type { BudgetRepository } from '../../domain/budget/budget.repository.js';
import { Budget } from '../../domain/budget/budget.js';
import { InvalidBudgetStatusException } from '../../domain/budget/value-objects/budget-status.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import { ApproveBudget, BudgetNotFoundError } from './approve-budget.js';

describe('ApproveBudget Use Case', () => {
    const validInput = { budgetId: 'orc-1' };

    const makeBudget = (): Budget =>
        Budget.create({
            id: 'orc-1',
            serviceOrderId: 'os-1',
            total: 450.9,
        });

    const makeRepository = (
        budget: Budget | null = makeBudget(),
    ): BudgetRepository => ({
        save: vi.fn().mockResolvedValue(undefined),
        findById: vi.fn().mockResolvedValue(budget),
        findByServiceOrderId: vi.fn().mockResolvedValue([]),
    });

    const makeEventBus = (): EventBus => ({
        publish: vi.fn().mockResolvedValue(undefined),
        subscribe: vi.fn(),
    });

    it('should approve a pending budget and publish BudgetApproved', async () => {
        const budget = makeBudget();
        const repository = makeRepository(budget);
        const eventBus = makeEventBus();
        const useCase = new ApproveBudget(repository, eventBus);

        const result = await useCase.execute(validInput);

        expect(result).toEqual({
            id: 'orc-1',
            serviceOrderId: 'os-1',
            total: 450.9,
            status: 'APPROVED',
        });
        expect(repository.save).toHaveBeenCalledTimes(1);
        expect(eventBus.publish).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    eventName: 'service-order.budget-approved',
                    aggregateId: 'orc-1',
                    serviceOrderId: 'os-1',
                    total: 450.9,
                }),
            ]),
        );
    });

    it('should throw BudgetNotFoundError when the budget does not exist', async () => {
        const repository = makeRepository(null);
        const useCase = new ApproveBudget(repository);

        await expect(useCase.execute(validInput)).rejects.toThrow(
            BudgetNotFoundError,
        );
        expect(repository.save).not.toHaveBeenCalled();
    });

    it('should throw InvalidBudgetStatusException when the budget is already approved', async () => {
        const budget = makeBudget();
        budget.approve();
        budget.pullEvents();
        const repository = makeRepository(budget);
        const useCase = new ApproveBudget(repository);

        await expect(useCase.execute(validInput)).rejects.toThrow(
            InvalidBudgetStatusException,
        );
        expect(repository.save).not.toHaveBeenCalled();
    });
});
