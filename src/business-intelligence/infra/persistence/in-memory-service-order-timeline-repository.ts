import {
    ServiceOrderTimeline,
    type ServiceOrderTimelineSnapshot,
} from '../../domain/service-order-timeline/service-order-timeline.js';
import type {
    PeriodFilter,
    ServiceOrderTimelineRepository,
} from '../../domain/service-order-timeline/service-order-timeline.repository.js';

const inPeriod = (date: Date | null, period: PeriodFilter): boolean => {
    if (!date) return false;
    const ms = date.getTime();
    if (period.from && ms < period.from.getTime()) return false;
    if (period.to && ms > period.to.getTime()) return false;
    return true;
};

export class InMemoryServiceOrderTimelineRepository implements ServiceOrderTimelineRepository {
    private readonly items = new Map<string, ServiceOrderTimelineSnapshot>();

    async findById(
        serviceOrderId: string,
    ): Promise<ServiceOrderTimeline | null> {
        const snapshot = this.items.get(serviceOrderId);
        return snapshot ? ServiceOrderTimeline.restore(snapshot) : null;
    }

    async save(timeline: ServiceOrderTimeline): Promise<void> {
        this.items.set(timeline.serviceOrderId, timeline.toSnapshot());
    }

    async findFinishedBetween(
        period: PeriodFilter,
    ): Promise<ServiceOrderTimeline[]> {
        const results: ServiceOrderTimeline[] = [];
        for (const snapshot of this.items.values()) {
            if (inPeriod(snapshot.finishedAt, period)) {
                results.push(ServiceOrderTimeline.restore(snapshot));
            }
        }
        return results;
    }

    async findDeliveredBetween(
        period: PeriodFilter,
    ): Promise<ServiceOrderTimeline[]> {
        const results: ServiceOrderTimeline[] = [];
        for (const snapshot of this.items.values()) {
            if (inPeriod(snapshot.deliveredAt, period)) {
                results.push(ServiceOrderTimeline.restore(snapshot));
            }
        }
        return results;
    }
}
