import type { ServiceOrderRepository } from '../../domain/service-order/service-order.repository.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import { ServiceOrderNotFoundError } from './add-supply-to-service-order.js';

export class ChangeServiceOrderStatus {
    constructor(
        private readonly orders: ServiceOrderRepository,
        private readonly bus: EventBus,
        private readonly action: 'startExecution' | 'finish' | 'deliver',
    ) {}

    async execute({ serviceOrderId }: { serviceOrderId: string }): Promise<{
        serviceOrderId: string;
        status: string;
    }> {
        const order = await this.orders.findById(serviceOrderId);
        if (!order) throw new ServiceOrderNotFoundError();
        order[this.action]();
        await this.orders.save(order);
        await this.bus.publish(order.pullEvents());
        return { serviceOrderId, status: order.status.value };
    }
}
