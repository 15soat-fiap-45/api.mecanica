import type { Budget } from '../budget/budget.js';
import type { ServiceOrder } from './service-order.js';
import type { ServiceOrderId } from './service-order-id.js';
import type { ServiceOrderStatusType } from './value-objects/service-order-status.js';

export interface ServiceOrderStatusHistoryEntry {
    status: ServiceOrderStatusType;
    valueCents: number | null;
    changedBy: string | null;
    recordedAt: Date;
}

export interface ServiceOrderListFilter {
    statuses?: ServiceOrderStatusType[] | undefined;
    vehicleId?: string | undefined;
    limit: number;
    offset: number;
}

export interface ServiceOrderListPage {
    /** Most recently opened first; openedAt is the first status record. */
    items: { order: ServiceOrder; openedAt: Date | null }[];
    total: number;
}

export interface ServiceOrderRepository {
    save(serviceOrder: ServiceOrder, budget?: Budget): Promise<void>;
    findById(id: ServiceOrderId | string): Promise<ServiceOrder | null>;
    findStatusHistory?(
        id: ServiceOrderId | string,
    ): Promise<ServiceOrderStatusHistoryEntry[]>;
    list?(filter: ServiceOrderListFilter): Promise<ServiceOrderListPage>;
}
