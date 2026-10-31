import type { ServiceRepository } from '../../domain/catalog/service.repository.js';
import type { ServiceOrder } from '../../domain/service-order/service-order.js';
import type { ServiceOrderRepository } from '../../domain/service-order/service-order.repository.js';
import { ServiceOrderNotFoundError } from './add-supply-to-service-order.js';
import { ServiceNotFoundError } from './service-use-cases.js';

export interface ServiceOrderServicesOutput {
    serviceOrderId: string;
    services: { serviceId: string; name: string; priceCents: number }[];
    totalCents: number;
}

const toOutput = (order: ServiceOrder): ServiceOrderServicesOutput => ({
    serviceOrderId: order.id.value,
    services: order.services.map((item) => ({
        serviceId: item.serviceId,
        name: item.name,
        priceCents: item.priceCents,
    })),
    totalCents: order.totalCents,
});

/** Inclui um serviço do catálogo na OS, copiando nome e preço atuais. */
export class AddServiceToServiceOrder {
    constructor(
        private readonly orders: ServiceOrderRepository,
        private readonly services: ServiceRepository,
    ) {}

    async execute(input: {
        serviceOrderId: string;
        serviceId: string;
    }): Promise<ServiceOrderServicesOutput> {
        const order = await this.orders.findById(input.serviceOrderId);
        if (!order) throw new ServiceOrderNotFoundError();
        const service = await this.services.findById(input.serviceId);
        if (!service) throw new ServiceNotFoundError();

        order.addService({
            serviceId: service.id.value,
            name: service.name,
            priceCents: service.priceCents,
        });
        await this.orders.save(order);
        return toOutput(order);
    }
}

export class RemoveServiceFromServiceOrder {
    constructor(private readonly orders: ServiceOrderRepository) {}

    async execute(input: {
        serviceOrderId: string;
        serviceId: string;
    }): Promise<ServiceOrderServicesOutput> {
        const order = await this.orders.findById(input.serviceOrderId);
        if (!order) throw new ServiceOrderNotFoundError();

        order.removeService(input.serviceId);
        await this.orders.save(order);
        return toOutput(order);
    }
}
