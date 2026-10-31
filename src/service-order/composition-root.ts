import type { EventBus } from '../shared/application/event-bus.js';
import type { UseCase } from '../shared/application/use-case.js';
import type { ServiceOrderRepository } from './domain/service-order/service-order.repository.js';
import type { BudgetRepository } from './domain/budget/budget.repository.js';
import type { ApprovalRequestRepository } from './domain/approval/approval-request.repository.js';
import type { EmailSender } from './application/ports/email-sender.js';
import type { VehicleContactLookup } from './application/ports/vehicle-contact.js';
import { OrderAwaitingApproval } from './domain/service-order/events/order-awaiting-approval.js';
import { SendBudgetApprovalEmail } from './application/handlers/send-budget-approval-email.js';
import { AwaitBudgetApproval } from './application/use-cases/await-budget-approval.js';
import { UpdateServiceOrderDescription } from './application/use-cases/update-service-order-description.js';
import { DecideBudgetApproval } from './application/use-cases/decide-budget-approval.js';
import type { ActorResolver } from './application/ports/actor-resolver.js';
import { ChangeServiceOrderStatus } from './application/use-cases/change-service-order-status.js';
import { TrackServiceOrder } from './application/use-cases/track-service-order.js';
import { SendVehicleReadyEmail } from './application/handlers/send-vehicle-ready-email.js';
import type { ServiceOrderFinished } from './domain/service-order/events/service-order-finished.js';
import type { BudgetApproved } from './domain/budget/events/budget-approved.js';
import { MoveServiceOrderToApproved } from './application/handlers/move-service-order-to-approved.js';
import {
    RegisterServiceOrder,
    type RegisterServiceOrderInput,
    type RegisterServiceOrderOutput,
} from './application/use-cases/register-service-order.js';
import {
    AddSupplyToServiceOrder,
    type AddSupplyToServiceOrderOutput,
    type AddSupplyToServiceOrderInput,
    ServiceOrderNotFoundError,
} from './application/use-cases/add-supply-to-service-order.js';
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
    approvalRequestRepository: ApprovalRequestRepository;
    vehicleContacts: VehicleContactLookup;
    emailSender: EmailSender;
    frontendUrl: string;
    approvalTokenTtlMinutes: number;
    actorResolver?: ActorResolver | undefined;
}

export interface ServiceOrderUseCases {
    actorResolver?: ActorResolver | undefined;
    registerServiceOrder: UseCase<
        RegisterServiceOrderInput,
        RegisterServiceOrderOutput
    >;
    addSupplyToServiceOrder: UseCase<
        AddSupplyToServiceOrderInput,
        AddSupplyToServiceOrderOutput
    >;
    awaitBudgetApproval: AwaitBudgetApproval;
    updateServiceOrderDescription: UpdateServiceOrderDescription;
    startExecution: ChangeServiceOrderStatus;
    finishServiceOrder: ChangeServiceOrderStatus;
    deliverServiceOrder: ChangeServiceOrderStatus;
    findServiceOrder: {
        execute(input: { serviceOrderId: string }): Promise<{
            id: string;
            vehicleId: string | null;
            description: string;
            status: string;
            valueCents: number | null;
            supplies: {
                partCode: string;
                quantity: number;
                used: boolean;
            }[];
        }>;
    };
    findServiceOrderHistory: {
        execute(input: { serviceOrderId: string }): Promise<{
            serviceOrderId: string;
            history: {
                status: string;
                valueCents: number | null;
                changedBy: string | null;
                recordedAt: string;
            }[];
        }>;
    };
    trackServiceOrder: TrackServiceOrder;
    decideBudgetApproval: DecideBudgetApproval;
    resendBudgetApproval: {
        execute(input: {
            serviceOrderId: string;
            budgetId: string;
        }): Promise<void>;
    };
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
    const sendBudgetApprovalEmail = new SendBudgetApprovalEmail(
        deps.approvalRequestRepository,
        deps.serviceOrderRepository,
        deps.budgetRepository,
        deps.vehicleContacts,
        deps.emailSender,
        deps.frontendUrl,
        deps.approvalTokenTtlMinutes,
    );
    eventBus.subscribe<OrderAwaitingApproval>(
        'service-order.awaiting-approval',
        (event) => sendBudgetApprovalEmail.handle(event),
    );
    const sendVehicleReadyEmail = new SendVehicleReadyEmail(
        deps.serviceOrderRepository,
        deps.vehicleContacts,
        deps.emailSender,
    );
    eventBus.subscribe<ServiceOrderFinished>(
        'service-order.finished',
        (event) => sendVehicleReadyEmail.handle(event),
    );

    return {
        actorResolver: deps.actorResolver,
        registerServiceOrder: new RegisterServiceOrder(
            deps.serviceOrderRepository,
            deps.vehicleContacts,
            eventBus,
        ),
        addSupplyToServiceOrder: new AddSupplyToServiceOrder(
            deps.serviceOrderRepository,
            eventBus,
        ),
        updateServiceOrderDescription: new UpdateServiceOrderDescription(
            deps.serviceOrderRepository,
        ),
        awaitBudgetApproval: new AwaitBudgetApproval(
            deps.serviceOrderRepository,
            deps.budgetRepository,
            eventBus,
        ),
        startExecution: new ChangeServiceOrderStatus(
            deps.serviceOrderRepository,
            eventBus,
            'startExecution',
        ),
        finishServiceOrder: new ChangeServiceOrderStatus(
            deps.serviceOrderRepository,
            eventBus,
            'finish',
        ),
        deliverServiceOrder: new ChangeServiceOrderStatus(
            deps.serviceOrderRepository,
            eventBus,
            'deliver',
        ),
        findServiceOrder: {
            execute: async ({ serviceOrderId }) => {
                const order =
                    await deps.serviceOrderRepository.findById(serviceOrderId);
                if (!order) throw new ServiceOrderNotFoundError();
                return {
                    id: order.id.value,
                    vehicleId: order.vehicleId,
                    description: order.description,
                    status: order.status.value,
                    valueCents: order.valueCents,
                    supplies: order.items.map((item) => ({
                        partCode: item.partCode,
                        quantity: item.quantity,
                        used: item.used,
                    })),
                };
            },
        },
        findServiceOrderHistory: {
            execute: async ({ serviceOrderId }) => {
                const order =
                    await deps.serviceOrderRepository.findById(serviceOrderId);
                if (!order) throw new ServiceOrderNotFoundError();
                const entries =
                    (await deps.serviceOrderRepository.findStatusHistory?.(
                        order.id.value,
                    )) ?? [];
                return {
                    serviceOrderId: order.id.value,
                    history: entries.map((entry) => ({
                        status: entry.status,
                        valueCents: entry.valueCents,
                        changedBy: entry.changedBy,
                        recordedAt: entry.recordedAt.toISOString(),
                    })),
                };
            },
        },
        trackServiceOrder: new TrackServiceOrder(
            deps.serviceOrderRepository,
            deps.vehicleContacts,
        ),
        decideBudgetApproval: new DecideBudgetApproval(
            deps.approvalRequestRepository,
            deps.serviceOrderRepository,
            deps.budgetRepository,
            eventBus,
        ),
        resendBudgetApproval: {
            execute: async ({ serviceOrderId, budgetId }) =>
                sendBudgetApprovalEmail.handle(
                    new OrderAwaitingApproval({
                        aggregateId: serviceOrderId,
                        budgetId,
                    }),
                ),
        },
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
