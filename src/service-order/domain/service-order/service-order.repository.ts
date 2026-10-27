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

export interface ServiceOrderRepository {
    save(serviceOrder: ServiceOrder, budget?: Budget): Promise<void>;
    findById(id: ServiceOrderId | string): Promise<ServiceOrder | null>;
    findStatusHistory?(
        id: ServiceOrderId | string,
    ): Promise<ServiceOrderStatusHistoryEntry[]>;
}
