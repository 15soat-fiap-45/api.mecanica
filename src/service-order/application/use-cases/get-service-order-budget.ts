import { ApplicationException } from '../../../shared/application/application-exception.js';
import type { UseCase } from '../../../shared/application/use-case.js';
import type { BudgetRepository } from '../../domain/budget/budget.repository.js';
import type { ServiceOrderRepository } from '../../domain/service-order/service-order.repository.js';
import { ServiceOrderNotFoundError } from './add-supply-to-service-order.js';

export class BudgetNotFoundError extends ApplicationException {
    constructor() {
        super('No budget has been generated for this service order yet.');
    }
}

export interface GetServiceOrderBudgetOutput {
    budgetId: string;
    serviceOrderId: string;
    status: string;
    services: { serviceId: string; name: string; priceCents: number }[];
    parts: {
        partCode: string;
        description: string | null;
        quantity: number;
        unitPriceCents: number;
        totalCents: number;
    }[];
    servicesCents: number;
    partsCents: number;
    /** Amount sent to (and approved/rejected by) the customer. */
    totalCents: number;
    /**
     * Current amount of the order: differs from totalCents when additional
     * supplies were included after the budget was sent.
     */
    currentTotalCents: number;
}

const STATUS_PRIORITY = ['APPROVED', 'PENDING', 'REJECTED'];

/** Detalhamento do orçamento para o atendente cobrar o cliente. */
export class GetServiceOrderBudget implements UseCase<
    { serviceOrderId: string },
    GetServiceOrderBudgetOutput
> {
    constructor(
        private readonly orders: ServiceOrderRepository,
        private readonly budgets: BudgetRepository,
    ) {}

    async execute(input: {
        serviceOrderId: string;
    }): Promise<GetServiceOrderBudgetOutput> {
        const order = await this.orders.findById(input.serviceOrderId);
        if (!order) throw new ServiceOrderNotFoundError();
        const [budget] = (
            await this.budgets.findByServiceOrderId(order.id.value)
        ).sort(
            (a, b) =>
                STATUS_PRIORITY.indexOf(a.status.value) -
                STATUS_PRIORITY.indexOf(b.status.value),
        );
        if (!budget) throw new BudgetNotFoundError();

        const services = order.services.map((item) => ({
            serviceId: item.serviceId,
            name: item.name,
            priceCents: item.priceCents,
        }));
        const parts = order.items.map((item) => ({
            partCode: item.partCode,
            description: item.description,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            totalCents: item.totalCents,
        }));
        return {
            budgetId: budget.id.value,
            serviceOrderId: order.id.value,
            status: budget.status.value,
            services,
            parts,
            servicesCents: services.reduce((sum, s) => sum + s.priceCents, 0),
            partsCents: parts.reduce((sum, p) => sum + p.totalCents, 0),
            totalCents: budget.totalCents,
            currentTotalCents: order.totalCents,
        };
    }
}
