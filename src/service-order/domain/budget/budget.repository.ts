import type { Budget } from './budget.js';
import type { BudgetId } from './budget-id.js';

export interface BudgetRepository {
    save(budget: Budget): Promise<void>;
    findById(id: BudgetId | string): Promise<Budget | null>;
    findByServiceOrderId(serviceOrderId: string): Promise<Budget[]>;
}
