import type { EventBus } from '../shared/application/event-bus.js';
import type { UseCase } from '../shared/application/use-case.js';
import { fromStockMovementRecorded } from './application/adapters/stock-movement-adapters.js';
import type {
    ServiceOrderCancelledContract,
    ServiceOrderDeliveredContract,
    ServiceOrderExecutionStartedContract,
    ServiceOrderFinishedContract,
    ServiceOrderRegisteredContract,
} from './application/contracts/service-order-events.js';
import type { StockMovementRecordedContract } from './application/contracts/stock-events.js';
import { ProjectRestockCycle } from './application/handlers/project-restock-cycle.js';
import { ProjectServiceOrderTimeline } from './application/handlers/project-service-order-timeline.js';
import type { BiAccessGuard } from './application/ports/bi-access-guard.js';
import {
    GetRestockLeadTime,
    type GetRestockLeadTimeInput,
    type GetRestockLeadTimeOutput,
} from './application/use-cases/get-restock-lead-time.js';
import {
    GetServiceOrderLeadTime,
    type GetServiceOrderLeadTimeInput,
    type GetServiceOrderLeadTimeOutput,
} from './application/use-cases/get-service-order-lead-time.js';
import {
    ReorderPointRestockPolicy,
    type RestockCyclePolicy,
} from './domain/restock-cycle/restock-cycle-policy.js';
import type { RestockCycleRepository } from './domain/restock-cycle/restock-cycle.repository.js';
import type { ServiceOrderTimelineRepository } from './domain/service-order-timeline/service-order-timeline.repository.js';

export interface BusinessIntelligenceDependencies {
    timelineRepository: ServiceOrderTimelineRepository;
    restockCycleRepository: RestockCycleRepository;
    restockPolicy?: RestockCyclePolicy | undefined;
    accessGuard?: BiAccessGuard | undefined;
}

export interface BusinessIntelligenceUseCases {
    accessGuard?: BiAccessGuard | undefined;
    getServiceOrderLeadTime: UseCase<
        GetServiceOrderLeadTimeInput,
        GetServiceOrderLeadTimeOutput
    >;
    getRestockLeadTime: UseCase<
        GetRestockLeadTimeInput,
        GetRestockLeadTimeOutput
    >;
}

/**
 * Composition root for the Business Intelligence context.
 *
 * Subscribes to Service Order and Stock events on the `EventBus` without
 * importing anything from those bounded contexts. The restock projection is
 * fed by `stock.movement-recorded` only: Stock also emits `stock.stock-updated`
 * for the same movement, so subscribing to both would count it twice.
 */
export function businessIntelligenceCompositionRoot(
    eventBus: EventBus,
    deps: BusinessIntelligenceDependencies,
): BusinessIntelligenceUseCases {
    const restockPolicy =
        deps.restockPolicy ?? new ReorderPointRestockPolicy(0);

    const projectTimeline = new ProjectServiceOrderTimeline(
        deps.timelineRepository,
    );
    eventBus.subscribe<ServiceOrderRegisteredContract>(
        'service-order.registered',
        (event) => projectTimeline.onRegistered(event),
    );
    eventBus.subscribe<ServiceOrderExecutionStartedContract>(
        'service-order.execution-started',
        (event) => projectTimeline.onExecutionStarted(event),
    );
    eventBus.subscribe<ServiceOrderFinishedContract>(
        'service-order.finished',
        (event) => projectTimeline.onFinished(event),
    );
    eventBus.subscribe<ServiceOrderDeliveredContract>(
        'service-order.delivered',
        (event) => projectTimeline.onDelivered(event),
    );
    eventBus.subscribe<ServiceOrderCancelledContract>(
        'service-order.cancelled',
        (event) => projectTimeline.onCancelled(event),
    );

    const projectRestock = new ProjectRestockCycle(
        deps.restockCycleRepository,
        restockPolicy,
    );
    eventBus.subscribe<StockMovementRecordedContract>(
        'stock.movement-recorded',
        (event) => projectRestock.handle(fromStockMovementRecorded(event)),
    );

    return {
        accessGuard: deps.accessGuard,
        getServiceOrderLeadTime: new GetServiceOrderLeadTime(
            deps.timelineRepository,
        ),
        getRestockLeadTime: new GetRestockLeadTime(
            deps.restockCycleRepository,
            restockPolicy,
        ),
    };
}
