import { ServiceOrderTimeline } from '../../domain/service-order-timeline/service-order-timeline.js';
import type { ServiceOrderTimelineRepository } from '../../domain/service-order-timeline/service-order-timeline.repository.js';
import type {
    ServiceOrderCancelledContract,
    ServiceOrderDeliveredContract,
    ServiceOrderExecutionStartedContract,
    ServiceOrderFinishedContract,
    ServiceOrderRegisteredContract,
} from '../contracts/service-order-events.js';

/**
 * Projects Service Order domain events into the BI `ServiceOrderTimeline`
 * read model.
 *
 * - Runs in its own transaction (eventual consistency between contexts).
 * - Uses `event.occurredOn` rather than the wall clock.
 * - Creates the timeline on the fly if an out-of-order event arrives before
 *   `service-order.registered`.
 */
export class ProjectServiceOrderTimeline {
    constructor(
        private readonly timelines: ServiceOrderTimelineRepository,
    ) {}

    async onRegistered(event: ServiceOrderRegisteredContract): Promise<void> {
        await this.update(event.aggregateId, (timeline) =>
            timeline.markRegistered(new Date(event.occurredOn)),
        );
    }

    async onExecutionStarted(
        event: ServiceOrderExecutionStartedContract,
    ): Promise<void> {
        await this.update(event.aggregateId, (timeline) =>
            timeline.markExecutionStarted(new Date(event.occurredOn)),
        );
    }

    async onFinished(event: ServiceOrderFinishedContract): Promise<void> {
        await this.update(event.aggregateId, (timeline) =>
            timeline.markFinished(new Date(event.occurredOn)),
        );
    }

    async onDelivered(event: ServiceOrderDeliveredContract): Promise<void> {
        await this.update(event.aggregateId, (timeline) =>
            timeline.markDelivered(new Date(event.occurredOn)),
        );
    }

    async onCancelled(event: ServiceOrderCancelledContract): Promise<void> {
        await this.update(event.aggregateId, (timeline) =>
            timeline.markCancelled(new Date(event.occurredOn)),
        );
    }

    private async update(
        serviceOrderId: string,
        mutate: (timeline: ServiceOrderTimeline) => void,
    ): Promise<void> {
        const timeline =
            (await this.timelines.findById(serviceOrderId)) ??
            ServiceOrderTimeline.start(serviceOrderId);
        mutate(timeline);
        await this.timelines.save(timeline);
    }
}
