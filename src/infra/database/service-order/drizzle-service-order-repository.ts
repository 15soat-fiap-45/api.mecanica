import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { actorContext } from '../../../service-order/application/ports/actor-resolver.js';
import type { Budget } from '../../../service-order/domain/budget/budget.js';
import type {
    ServiceOrderListFilter,
    ServiceOrderListPage,
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
    serviceOrderServices,
    serviceOrderSupplies,
} from '../schema.js';
import { ConcurrentModificationError } from './concurrent-modification-error.js';
import {
    budgetToRow,
    serviceItemsToRows,
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

            await tx
                .delete(serviceOrderServices)
                .where(eq(serviceOrderServices.serviceOrderId, order.id.value));

            const services = serviceItemsToRows(order);
            if (services.length > 0) {
                await tx.insert(serviceOrderServices).values(services);
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
                        ${budget?.totalCents ?? null}::bigint,
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
        // Both child tables are joined, so rows are deduplicated by key.
        const rows = await this.database
            .select({
                order: serviceOrders,
                item: serviceOrderSupplies,
                service: serviceOrderServices,
            })
            .from(serviceOrders)
            .leftJoin(
                serviceOrderSupplies,
                eq(serviceOrders.id, serviceOrderSupplies.serviceOrderId),
            )
            .leftJoin(
                serviceOrderServices,
                eq(serviceOrders.id, serviceOrderServices.serviceOrderId),
            )
            .where(eq(serviceOrders.id, typeof id === 'string' ? id : id.value))
            .orderBy(
                asc(serviceOrderSupplies.partCode),
                asc(serviceOrderServices.name),
            );

        const first = rows[0];
        if (!first) return null;
        const items = new Map<
            string,
            typeof serviceOrderSupplies.$inferSelect
        >();
        const services = new Map<
            string,
            typeof serviceOrderServices.$inferSelect
        >();
        for (const { item, service } of rows) {
            if (item) items.set(item.partCode, item);
            if (service) services.set(service.serviceId, service);
        }
        return serviceOrderFromRow(
            first.order,
            [...items.values()],
            [...services.values()].sort((a, b) => a.name.localeCompare(b.name)),
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

    async list(filter: ServiceOrderListFilter): Promise<ServiceOrderListPage> {
        // The order has no creation column: it opens with its first status record.
        // orders.id is qualified by hand: inside the select list Drizzle renders it
        // unqualified, which the subquery would resolve to h.id.
        const openedAt = sql`(
            SELECT min(h.recorded_at)
            FROM service_order.order_status_history h
            WHERE h.order_id = service_order.orders.id
        )`.mapWith(orderStatusHistory.recordedAt);
        const where = and(
            filter.statuses?.length
                ? inArray(serviceOrders.status, filter.statuses)
                : undefined,
            filter.vehicleId
                ? eq(serviceOrders.vehicleId, filter.vehicleId)
                : undefined,
        );

        const [rows, counted] = await Promise.all([
            this.database
                .select({ order: serviceOrders, openedAt })
                .from(serviceOrders)
                .where(where)
                .orderBy(
                    sql`${openedAt} DESC NULLS LAST`,
                    asc(serviceOrders.id),
                )
                .limit(filter.limit)
                .offset(filter.offset),
            this.database
                .select({ total: sql<number>`count(*)`.mapWith(Number) })
                .from(serviceOrders)
                .where(where),
        ]);
        const total = counted[0]?.total ?? 0;
        const ids = rows.map((row) => row.order.id);
        if (ids.length === 0) return { items: [], total };

        const [items, services] = await Promise.all([
            this.database
                .select()
                .from(serviceOrderSupplies)
                .where(inArray(serviceOrderSupplies.serviceOrderId, ids))
                .orderBy(asc(serviceOrderSupplies.partCode)),
            this.database
                .select()
                .from(serviceOrderServices)
                .where(inArray(serviceOrderServices.serviceOrderId, ids))
                .orderBy(asc(serviceOrderServices.name)),
        ]);
        return {
            items: rows.map((row) => ({
                order: serviceOrderFromRow(
                    row.order,
                    items.filter((i) => i.serviceOrderId === row.order.id),
                    services.filter((s) => s.serviceOrderId === row.order.id),
                ),
                openedAt: row.openedAt ?? null,
            })),
            total,
        };
    }
}
