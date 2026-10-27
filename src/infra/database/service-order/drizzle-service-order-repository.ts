import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { actorContext } from '../../../service-order/application/ports/actor-resolver.js';
import type { Budget } from '../../../service-order/domain/budget/budget.js';
import type {
    ServiceOrderRepository,
    ServiceOrderStatusHistoryEntry,
} from '../../../service-order/domain/service-order/service-order.repository.js';
import type { ServiceOrder } from '../../../service-order/domain/service-order/service-order.js';
import type { ServiceOrderId } from '../../../service-order/domain/service-order/service-order-id.js';
import type { ServiceOrderStatusType } from '../../../service-order/domain/service-order/value-objects/service-order-status.js';
import { db } from '../connection.js';
import {
    approvalRequests,
    budgets,
    orderStatusHistory,
    serviceOrders,
    serviceOrderSupplies,
} from '../schema.js';
import { ConcurrentModificationError } from './concurrent-modification-error.js';
import {
    budgetToRow,
    serviceOrderFromRow,
    serviceOrderToRow,
    supplyItemsToRows,
} from './service-order-mappers.js';

export class DrizzleServiceOrderRepository implements ServiceOrderRepository {
    constructor(private readonly database: typeof db = db) {}

    async save(order: ServiceOrder, budget?: Budget): Promise<void> {
        const changedBy = actorContext.getStore() ?? null;
        await this.database.transaction(async (tx) => {
            const row = serviceOrderToRow(order);
            const saved = await tx
                .insert(serviceOrders)
                .values(row)
                .onConflictDoUpdate({
                    target: serviceOrders.id,
                    set: row,
                    setWhere: eq(serviceOrders.version, order.version),
                })
                .returning({ id: serviceOrders.id });

            if (saved.length === 0) throw new ConcurrentModificationError();

            if (budget) {
                const budgetRow = budgetToRow(budget);
                const savedBudget = await tx
                    .insert(budgets)
                    .values(budgetRow)
                    .onConflictDoUpdate({
                        target: budgets.id,
                        set: budgetRow,
                        setWhere: eq(budgets.version, budget.version),
                    })
                    .returning({ id: budgets.id });

                if (savedBudget.length === 0)
                    throw new ConcurrentModificationError();
            }

            await tx
                .delete(serviceOrderSupplies)
                .where(eq(serviceOrderSupplies.serviceOrderId, order.id.value));

            const items = supplyItemsToRows(order);
            if (items.length > 0) {
                await tx.insert(serviceOrderSupplies).values(items);
            }

            if (order.status.value === 'CANCELLED') {
                await tx
                    .update(approvalRequests)
                    .set({ revokedAt: new Date() })
                    .where(
                        and(
                            eq(approvalRequests.orderId, order.id.value),
                            isNull(approvalRequests.usedAt),
                            isNull(approvalRequests.revokedAt),
                        ),
                    );
            }

            await tx.execute(sql`
                INSERT INTO service_order.order_status_history (order_id, status, value_cents, changed_by)
                SELECT
                    ${order.id.value},
                    ${order.status.value},
                    COALESCE(
                        ${budget ? budget.totalCents : null}::bigint,
                        (
                            SELECT h.value_cents
                            FROM service_order.order_status_history h
                            WHERE h.order_id = ${order.id.value}
                              AND h.value_cents IS NOT NULL
                            ORDER BY h.id DESC
                            LIMIT 1
                        )
                    ),
                    ${changedBy}
                WHERE (
                    SELECT h.status
                    FROM service_order.order_status_history h
                    WHERE h.order_id = ${order.id.value}
                    ORDER BY h.id DESC
                    LIMIT 1
                ) IS DISTINCT FROM ${order.status.value}
            `);
        });
        order.markPersisted();
        budget?.markPersisted();
    }

    async findById(id: ServiceOrderId | string): Promise<ServiceOrder | null> {
        // A single SELECT gives one consistent snapshot of the aggregate.
        const rows = await this.database
            .select({ order: serviceOrders, item: serviceOrderSupplies })
            .from(serviceOrders)
            .leftJoin(
                serviceOrderSupplies,
                eq(serviceOrders.id, serviceOrderSupplies.serviceOrderId),
            )
            .where(eq(serviceOrders.id, typeof id === 'string' ? id : id.value))
            .orderBy(asc(serviceOrderSupplies.partCode));

        const first = rows[0];
        if (!first) return null;
        return serviceOrderFromRow(
            first.order,
            rows.flatMap(({ item }) => (item ? [item] : [])),
        );
    }

    async findStatusHistory(
        id: ServiceOrderId | string,
    ): Promise<ServiceOrderStatusHistoryEntry[]> {
        const orderId = typeof id === 'string' ? id : id.value;
        const rows = await this.database
            .select({
                status: orderStatusHistory.status,
                valueCents: orderStatusHistory.valueCents,
                changedBy: orderStatusHistory.changedBy,
                recordedAt: orderStatusHistory.recordedAt,
            })
            .from(orderStatusHistory)
            .where(eq(orderStatusHistory.orderId, orderId))
            .orderBy(asc(orderStatusHistory.id));

        return rows.map((row) => ({
            status: row.status as ServiceOrderStatusType,
            valueCents: row.valueCents,
            changedBy: row.changedBy,
            recordedAt: row.recordedAt,
        }));
    }
}
