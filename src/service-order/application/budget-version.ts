import { createHash } from 'node:crypto';
import type { Budget } from '../domain/budget/budget.js';
import type { ServiceOrder } from '../domain/service-order/service-order.js';

export function budgetVersion(budget: Budget, order: ServiceOrder): string {
    return createHash('sha256')
        .update(
            JSON.stringify({
                budgetId: budget.id.value,
                budgetVersion: budget.version,
                totalCents: budget.totalCents,
                description: order.description,
                items: order.items
                    .map((i) => ({
                        partCode: i.partCode,
                        quantity: i.quantity,
                    }))
                    .sort((a, b) => a.partCode.localeCompare(b.partCode)),
            }),
        )
        .digest('hex');
}
