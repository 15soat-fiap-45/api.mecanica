import { asc, eq } from 'drizzle-orm';
import type { BudgetRepository } from '../../../service-order/domain/budget/budget.repository.js';
import type { Budget } from '../../../service-order/domain/budget/budget.js';
import type { BudgetId } from '../../../service-order/domain/budget/budget-id.js';
import { db } from '../connection.js';
import { budgets } from '../schema.js';
import { ConcurrentModificationError } from './concurrent-modification-error.js';
import { budgetFromRow, budgetToRow } from './service-order-mappers.js';

export class DrizzleBudgetRepository implements BudgetRepository {
    constructor(private readonly database: typeof db = db) {}

    async save(budget: Budget): Promise<void> {
        const row = budgetToRow(budget);
        const saved = await this.database
            .insert(budgets)
            .values(row)
            .onConflictDoUpdate({
                target: budgets.id,
                set: row,
                setWhere: eq(budgets.version, budget.version),
            })
            .returning({ id: budgets.id });

        if (saved.length === 0) throw new ConcurrentModificationError();
        budget.markPersisted();
    }

    async findById(id: BudgetId | string): Promise<Budget | null> {
        const [row] = await this.database
            .select()
            .from(budgets)
            .where(eq(budgets.id, typeof id === 'string' ? id : id.value))
            .limit(1);
        return row ? budgetFromRow(row) : null;
    }

    async findByServiceOrderId(serviceOrderId: string): Promise<Budget[]> {
        const rows = await this.database
            .select()
            .from(budgets)
            .where(eq(budgets.serviceOrderId, serviceOrderId))
            .orderBy(asc(budgets.id));
        return rows.map(budgetFromRow);
    }
}
