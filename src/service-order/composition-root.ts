import type { EventBus } from '../shared/application/event-bus.js';
import type { UseCase } from '../shared/application/use-case.js';
import type { ServiceOrderRepository } from './domain/service-order/service-order.repository.js';
import type { BudgetRepository } from './domain/budget/budget.repository.js';
import type { BudgetApproved } from './domain/budget/events/budget-approved.js';
import { MoveServiceOrderToApproved } from './application/handlers/move-service-order-to-approved.js';
import {
    RegisterServiceOrder,
    type RegisterServiceOrderInput,
    type RegisterServiceOrderOutput,
} from './application/use-cases/register-service-order.js';
import {
    AddSupplyToServiceOrder,
    type AddSupplyToServiceOrderInput,
    type AddSupplyToServiceOrderOutput,
} from './application/use-cases/add-supply-to-service-order.js';
import {
    ApproveBudget,
    type ApproveBudgetInput,
    type ApproveBudgetOutput,
} from './application/use-cases/approve-budget.js';
import {
    RegisterSupplyUsage,
    type RegisterSupplyUsageInput,
    type RegisterSupplyUsageOutput,
} from './application/use-cases/register-supply-usage.js';
import {
    CancelServiceOrder,
    type CancelServiceOrderInput,
    type CancelServiceOrderOutput,
} from './application/use-cases/cancel-service-order.js';

export interface ServiceOrderDependencies {
    serviceOrderRepository: ServiceOrderRepository;
    budgetRepository: BudgetRepository;
}

export interface ServiceOrderUseCases {
    registerServiceOrder: UseCase<
        RegisterServiceOrderInput,
        RegisterServiceOrderOutput
    >;
    addSupplyToServiceOrder: UseCase<
        AddSupplyToServiceOrderInput,
        AddSupplyToServiceOrderOutput
    >;
    approveBudget: UseCase<ApproveBudgetInput, ApproveBudgetOutput>;
    registerSupplyUsage: UseCase<
        RegisterSupplyUsageInput,
        RegisterSupplyUsageOutput
    >;
    cancelServiceOrder: UseCase<
        CancelServiceOrderInput,
        CancelServiceOrderOutput
    >;
}

export function serviceOrderCompositionRoot(
    eventBus: EventBus,
    deps: ServiceOrderDependencies,
): ServiceOrderUseCases {
    const moveServiceOrderToApproved = new MoveServiceOrderToApproved(
        deps.serviceOrderRepository,
    );
    eventBus.subscribe<BudgetApproved>(
        'service-order.budget-approved',
        (event) => moveServiceOrderToApproved.handle(event),
    );

    return {
        registerServiceOrder: new RegisterServiceOrder(
            deps.serviceOrderRepository,
            eventBus,
        ),
        addSupplyToServiceOrder: new AddSupplyToServiceOrder(
            deps.serviceOrderRepository,
            eventBus,
        ),
        approveBudget: new ApproveBudget(deps.budgetRepository, eventBus),
        registerSupplyUsage: new RegisterSupplyUsage(
            deps.serviceOrderRepository,
            eventBus,
        ),
        cancelServiceOrder: new CancelServiceOrder(
            deps.serviceOrderRepository,
            eventBus,
        ),
    };
}
