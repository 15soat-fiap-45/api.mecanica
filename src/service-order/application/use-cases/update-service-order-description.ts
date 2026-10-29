import type { ServiceOrderRepository } from '../../domain/service-order/service-order.repository.js';
import { ServiceOrderNotFoundError } from './add-supply-to-service-order.js';

export class UpdateServiceOrderDescription {
    constructor(private readonly orders: ServiceOrderRepository) {}

    async execute(input: {
        serviceOrderId: string;
        description: string;
    }): Promise<{ serviceOrderId: string; description: string }> {
        const order = await this.orders.findById(input.serviceOrderId);
        if (!order) throw new ServiceOrderNotFoundError();

        order.updateDescription(input.description);
        await this.orders.save(order);

        return {
            serviceOrderId: order.id.value,
            description: order.description,
        };
    }
}
