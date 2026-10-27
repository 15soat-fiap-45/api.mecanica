import type { ServiceOrderRepository } from '../../domain/service-order/service-order.repository.js';
import type { BudgetRepository } from '../../domain/budget/budget.repository.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import { ApplicationException } from '../../../shared/application/application-exception.js';
import { ServiceOrderNotFoundError } from './add-supply-to-service-order.js';
import { Budget } from '../../domain/budget/budget.js';
import type { ServiceCatalog } from '../ports/service-catalog.js';

export class InvalidOrderBudgetError extends ApplicationException {
    constructor() {
        super('Budget must belong to the order and be pending.');
    }
}

export class AwaitBudgetApproval {
    constructor(
        private readonly orders: ServiceOrderRepository,
        private readonly budgets: BudgetRepository,
        private readonly services: ServiceCatalog,
        private readonly bus: EventBus,
    ) {}

    async execute(input: {
        serviceOrderId: string;
    }): Promise<{ status: string }> {
        const order = await this.orders.findById(input.serviceOrderId);
        if (!order) throw new ServiceOrderNotFoundError();
        if (!order.status.canTransitionTo('AWAITING_APPROVAL'))
            throw new InvalidOrderBudgetError();
        const services = await this.services.forOrder(order.id.value);
        if (!services.length) throw new InvalidOrderBudgetError();
        const totalCents = services.reduce(
            (total, service) => total + service.valueCents,
            0,
        );
        if (!Number.isSafeInteger(totalCents))
            throw new InvalidOrderBudgetError();
        const budget = Budget.create({
            serviceOrderId: order.id.value,
            totalCents,
        });
        order.awaitApproval(budget.id.value);
        await this.orders.save(order, budget);
        await this.bus.publish(order.pullEvents());
        return { status: order.status.value };
    }
}
