import type { ServiceOrderTimeline } from './service-order-timeline.js';

export interface PeriodFilter {
    from?: Date | undefined;
    to?: Date | undefined;
}

export interface ServiceOrderTimelineRepository {
    findById(serviceOrderId: string): Promise<ServiceOrderTimeline | null>;
    save(timeline: ServiceOrderTimeline): Promise<void>;
    /** Timelines whose `finishedAt` falls within the period (inclusive). */
    findFinishedBetween(period: PeriodFilter): Promise<ServiceOrderTimeline[]>;
    /** Timelines whose `deliveredAt` falls within the period (inclusive). */
    findDeliveredBetween(period: PeriodFilter): Promise<ServiceOrderTimeline[]>;
}
