import { asc, eq } from 'drizzle-orm';
import type { ServiceOrderRepository } from '../../../service-order/domain/service-order/service-order.repository.js';
import type { ServiceOrder } from '../../../service-order/domain/service-order/service-order.js';
import type { ServiceOrderId } from '../../../service-order/domain/service-order/service-order-id.js';
import { db } from '../connection.js';
import { serviceOrders, serviceOrderSupplies } from '../schema.js';
import { ConcurrentModificationError } from './concurrent-modification-error.js';
import {
    serviceOrderFromRow,
    serviceOrderToRow,
    supplyItemsToRows,
} from './service-order-mappers.js';

export class DrizzleServiceOrderRepository implements ServiceOrderRepository {
    constructor(private readonly database: typeof db = db) {}

    async save(order: ServiceOrder): Promise<void> {
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

            await tx
                .delete(serviceOrderSupplies)
                .where(eq(serviceOrderSupplies.serviceOrderId, order.id.value));

            const items = supplyItemsToRows(order);
            if (items.length > 0) {
                await tx.insert(serviceOrderSupplies).values(items);
            }
        });
        order.markPersisted();
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
}
