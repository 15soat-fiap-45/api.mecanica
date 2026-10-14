import type { ServiceOrderRepository } from '../../domain/service-order/service-order.repository.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import type { UseCase } from '../../../shared/application/use-case.js';
import { ApplicationException } from '../../../shared/application/application-exception.js';

export class ServiceOrderNotFoundError extends ApplicationException {
    constructor() {
        super('Service order not found.');
    }
}

export interface AddSupplyToServiceOrderInput {
    serviceOrderId: string;
    partCode: string;
    quantity: number;
}

export interface AddSupplyToServiceOrderOutput {
    serviceOrderId: string;
    partCode: string;
    quantity: number;
}

export class AddSupplyToServiceOrder implements UseCase<
    AddSupplyToServiceOrderInput,
    AddSupplyToServiceOrderOutput
> {
    constructor(
        private readonly serviceOrderRepository: ServiceOrderRepository,
        private readonly eventBus?: EventBus,
    ) {}

    async execute(
        input: AddSupplyToServiceOrderInput,
    ): Promise<AddSupplyToServiceOrderOutput> {
        const serviceOrder = await this.serviceOrderRepository.findById(
            input.serviceOrderId,
        );
        if (!serviceOrder) {
            throw new ServiceOrderNotFoundError();
        }

        serviceOrder.addSupply(input.partCode, input.quantity);

        await this.serviceOrderRepository.save(serviceOrder);

        if (this.eventBus) {
            await this.eventBus.publish(serviceOrder.pullEvents());
        }

        const item = serviceOrder.items.find(
            (i) => i.partCode === input.partCode.trim().toUpperCase(),
        );

        return {
            serviceOrderId: serviceOrder.id.value,
            partCode: item?.partCode ?? input.partCode,
            quantity: item?.quantity ?? input.quantity,
        };
    }
}
