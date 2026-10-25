import type { BudgetRepository } from '../../domain/budget/budget.repository.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import type { UseCase } from '../../../shared/application/use-case.js';
import { ApplicationException } from '../../../shared/application/application-exception.js';

export class BudgetNotFoundError extends ApplicationException {
    constructor() {
        super('Budget not found.');
    }
}

export interface ApproveBudgetInput {
    budgetId: string;
}

export interface ApproveBudgetOutput {
    id: string;
    serviceOrderId: string;
    totalCents: number;
    status: string;
}

export class ApproveBudget implements UseCase<
    ApproveBudgetInput,
    ApproveBudgetOutput
> {
    constructor(
        private readonly budgetRepository: BudgetRepository,
        private readonly eventBus?: EventBus,
    ) {}

    async execute(input: ApproveBudgetInput): Promise<ApproveBudgetOutput> {
        const budget = await this.budgetRepository.findById(input.budgetId);
        if (!budget) {
            throw new BudgetNotFoundError();
        }

        budget.approve();

        await this.budgetRepository.save(budget);

        if (this.eventBus) {
            await this.eventBus.publish(budget.pullEvents());
        }

        return {
            id: budget.id.value,
            serviceOrderId: budget.serviceOrderId,
            totalCents: budget.totalCents,
            status: budget.status.value,
        };
    }
}
