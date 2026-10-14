import type { ServiceOrderRepository } from '../../domain/service-order/service-order.repository.js';
import type { BudgetApproved } from '../../domain/budget/events/budget-approved.js';
import { ServiceOrderNotFoundError } from '../use-cases/add-supply-to-service-order.js';

/**
 * Policy: when a budget is approved, the service order it belongs to moves
 * to APPROVED so the repair can start.
 *
 * The budget lives in the same context, so the handler works with the
 * domain event type directly. Runs in its own transaction: consistency
 * between the Budget and ServiceOrder aggregates is eventual.
 *
 * Idempotent: an already approved service order is skipped, so the event
 * may be delivered twice with no side effects.
 */
export class MoveServiceOrderToApproved {
    constructor(
        private readonly serviceOrderRepository: ServiceOrderRepository,
    ) {}

    async handle(event: BudgetApproved): Promise<void> {
        const serviceOrder = await this.serviceOrderRepository.findById(
            event.serviceOrderId,
        );
        if (!serviceOrder) {
            throw new ServiceOrderNotFoundError();
        }

        if (serviceOrder.status.value === 'APPROVED') {
            return;
        }

        serviceOrder.approve();

        await this.serviceOrderRepository.save(serviceOrder);
    }
}
