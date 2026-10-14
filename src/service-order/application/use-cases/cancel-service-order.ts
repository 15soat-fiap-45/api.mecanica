import type { ServiceOrderRepository } from '../../domain/service-order/service-order.repository.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import type { UseCase } from '../../../shared/application/use-case.js';
import { ServiceOrderNotFoundError } from './add-supply-to-service-order.js';

export interface CancelServiceOrderInput {
    serviceOrderId: string;
}

export interface CancelServiceOrderOutput {
    serviceOrderId: string;
    status: string;
}

/**
 * Cancels a service order and publishes ServiceOrderCancelled so the
 * Stock context releases the order's reserved supplies back to stock.
 *
 * Idempotent: cancelling an already CANCELLED order returns the current
 * status without publishing the event again.
 */
export class CancelServiceOrder implements UseCase<
    CancelServiceOrderInput,
    CancelServiceOrderOutput
> {
    constructor(
        private readonly serviceOrderRepository: ServiceOrderRepository,
        private readonly eventBus?: EventBus,
    ) {}

    async execute(
        input: CancelServiceOrderInput,
    ): Promise<CancelServiceOrderOutput> {
        const serviceOrder = await this.serviceOrderRepository.findById(
            input.serviceOrderId,
        );
        if (!serviceOrder) {
            throw new ServiceOrderNotFoundError();
        }

        if (serviceOrder.status.value !== 'CANCELLED') {
            serviceOrder.cancel();
            await this.serviceOrderRepository.save(serviceOrder);

            if (this.eventBus) {
                await this.eventBus.publish(serviceOrder.pullEvents());
            }
        }

        return {
            serviceOrderId: serviceOrder.id.value,
            status: serviceOrder.status.value,
        };
    }
}
