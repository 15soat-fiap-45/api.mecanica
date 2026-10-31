import { Budget } from '../../../service-order/domain/budget/budget.js';
import { BudgetStatus } from '../../../service-order/domain/budget/value-objects/budget-status.js';
import { ServiceOrder } from '../../../service-order/domain/service-order/service-order.js';
import { SupplyItem } from '../../../service-order/domain/service-order/supply-item.js';
import { ServiceItem } from '../../../service-order/domain/service-order/service-item.js';
import { ServiceOrderStatus } from '../../../service-order/domain/service-order/value-objects/service-order-status.js';
import {
    budgets,
    serviceOrders,
    serviceOrderServices,
    serviceOrderSupplies,
} from '../schema.js';

export function serviceOrderFromRow(
    row: typeof serviceOrders.$inferSelect,
    items: (typeof serviceOrderSupplies.$inferSelect)[],
    services: (typeof serviceOrderServices.$inferSelect)[] = [],
): ServiceOrder {
    return ServiceOrder.create({
        id: row.id,
        description: row.description,
        vehicleId: row.vehicleId ?? undefined,
        status: ServiceOrderStatus.create(row.status),
        version: row.version,
        items: items.map((item) => SupplyItem.create(item)),
        services: services.map((service) => ServiceItem.create(service)),
    });
}

export function serviceOrderToRow(
    order: ServiceOrder,
): typeof serviceOrders.$inferInsert {
    return {
        id: order.id.value,
        description: order.description,
        vehicleId: order.vehicleId,
        status: order.status.value,
        version: order.version + 1,
    };
}

export function supplyItemsToRows(
    order: ServiceOrder,
): (typeof serviceOrderSupplies.$inferInsert)[] {
    return order.items.map((item) => ({
        serviceOrderId: order.id.value,
        partCode: item.partCode,
        quantity: item.quantity,
        used: item.used,
        description: item.description,
        unitPriceCents: item.unitPriceCents,
    }));
}

export function serviceItemsToRows(
    order: ServiceOrder,
): (typeof serviceOrderServices.$inferInsert)[] {
    return order.services.map((service) => ({
        serviceOrderId: order.id.value,
        serviceId: service.serviceId,
        name: service.name,
        priceCents: service.priceCents,
    }));
}

export function budgetFromRow(row: typeof budgets.$inferSelect): Budget {
    return Budget.create({
        id: row.id,
        serviceOrderId: row.serviceOrderId,
        totalCents: row.totalCents,
        status: BudgetStatus.create(row.status),
        version: row.version,
    });
}

export function budgetToRow(budget: Budget): typeof budgets.$inferInsert {
    return {
        id: budget.id.value,
        serviceOrderId: budget.serviceOrderId,
        totalCents: budget.totalCents,
        status: budget.status.value,
        version: budget.version + 1,
    };
}
