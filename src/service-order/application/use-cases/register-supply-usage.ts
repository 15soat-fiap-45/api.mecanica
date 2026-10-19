import type { ServiceOrderRepository } from '../../domain/service-order/service-order.repository.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import type { UseCase } from '../../../shared/application/use-case.js';
import { ServiceOrderNotFoundError } from './add-supply-to-service-order.js';

export interface RegisterSupplyUsageInput {
    serviceOrderId: string;
    partCode: string;
}

export interface RegisterSupplyUsageOutput {
    serviceOrderId: string;
    partCode: string;
    quantity: number;
    used: boolean;
}

export class RegisterSupplyUsage implements UseCase<
    RegisterSupplyUsageInput,
    RegisterSupplyUsageOutput
> {
    constructor(
        private readonly serviceOrderRepository: ServiceOrderRepository,
        private readonly eventBus?: EventBus,
    ) {}

    async execute(
        input: RegisterSupplyUsageInput,
    ): Promise<RegisterSupplyUsageOutput> {
        const serviceOrder = await this.serviceOrderRepository.findById(
            input.serviceOrderId,
        );
        if (!serviceOrder) {
            throw new ServiceOrderNotFoundError();
        }

        serviceOrder.markSupplyUsed(input.partCode);

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
            quantity: item?.quantity ?? 0,
            used: item?.used ?? true,
        };
    }
}
