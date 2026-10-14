import type { ServiceOrder } from './service-order.js';
import type { ServiceOrderId } from './service-order-id.js';

export interface ServiceOrderRepository {
    save(serviceOrder: ServiceOrder): Promise<void>;
    findById(id: ServiceOrderId | string): Promise<ServiceOrder | null>;
}
