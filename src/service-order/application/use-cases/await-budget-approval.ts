import type { ServiceOrderRepository } from '../../domain/service-order/service-order.repository.js';
import type { BudgetRepository } from '../../domain/budget/budget.repository.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import { ApplicationException } from '../../../shared/application/application-exception.js';
import { ServiceOrderNotFoundError } from './add-supply-to-service-order.js';
import { Budget } from '../../domain/budget/budget.js';

export class InvalidOrderBudgetError extends ApplicationException {
    constructor() {
        super('Budget must belong to the order and be pending.');
    }
}

export class AwaitBudgetApproval {
    constructor(
        private readonly orders: ServiceOrderRepository,
        private readonly budgets: BudgetRepository,
        private readonly bus: EventBus,
    ) {}

    async execute(input: {
        serviceOrderId: string;
        valueCents?: number | undefined;
        description?: string | undefined;
    }): Promise<{ status: string }> {
        const order = await this.orders.findById(input.serviceOrderId);
        if (!order) throw new ServiceOrderNotFoundError();
        if (!order.status.canTransitionTo('AWAITING_APPROVAL'))
            throw new InvalidOrderBudgetError();
        if (input.valueCents !== undefined) {
            if (
                typeof input.valueCents !== 'number' ||
                !Number.isSafeInteger(input.valueCents) ||
                input.valueCents < 0
            ) {
                throw new InvalidOrderBudgetError();
            }
            order.setValueCents(input.valueCents);
        }
        const totalCents = order.valueCents;
        if (
            totalCents === null ||
            !Number.isSafeInteger(totalCents) ||
            totalCents < 0
        ) {
            throw new InvalidOrderBudgetError();
        }
        if (input.description !== undefined) {
            order.updateDescription(input.description);
        }
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
