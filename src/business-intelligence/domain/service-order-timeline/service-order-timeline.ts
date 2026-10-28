export interface ServiceOrderTimelineSnapshot {
    serviceOrderId: string;
    registeredAt: Date | null;
    executionStartedAt: Date | null;
    finishedAt: Date | null;
    deliveredAt: Date | null;
    cancelledAt: Date | null;
}

const diff = (from: Date | null, to: Date | null): number | null => {
    if (!from || !to) return null;
    const value = to.getTime() - from.getTime();
    return value >= 0 ? value : null;
};

/**
 * Read model (projection) of a service order's life cycle, built only from
 * the events published by the Service Order context.
 *
 * - Each milestone keeps the FIRST timestamp received: replays or duplicate
 *   deliveries of the same event are no-ops (idempotent handlers).
 * - Timestamps come from `event.occurredOn`, never from the handler clock.
 * - Cancelled orders are excluded from every metric.
 * - Negative durations (events received out of order) are reported as null.
 */
export class ServiceOrderTimeline {
    private constructor(private readonly state: ServiceOrderTimelineSnapshot) {}

    static start(serviceOrderId: string): ServiceOrderTimeline {
        return new ServiceOrderTimeline({
            serviceOrderId,
            registeredAt: null,
            executionStartedAt: null,
            finishedAt: null,
            deliveredAt: null,
            cancelledAt: null,
        });
    }

    static restore(snapshot: ServiceOrderTimelineSnapshot): ServiceOrderTimeline {
        return new ServiceOrderTimeline({ ...snapshot });
    }

    get serviceOrderId(): string {
        return this.state.serviceOrderId;
    }

    get isCancelled(): boolean {
        return this.state.cancelledAt !== null;
    }

    markRegistered(at: Date): void {
        this.state.registeredAt ??= at;
    }

    markExecutionStarted(at: Date): void {
        this.state.executionStartedAt ??= at;
    }

    markFinished(at: Date): void {
        this.state.finishedAt ??= at;
    }

    markDelivered(at: Date): void {
        this.state.deliveredAt ??= at;
    }

    markCancelled(at: Date): void {
        this.state.cancelledAt ??= at;
    }

    /** registered → finished */
    totalLeadTimeMs(): number | null {
        if (this.isCancelled) return null;
        return diff(this.state.registeredAt, this.state.finishedAt);
    }

    /** execution-started → finished */
    executionTimeMs(): number | null {
        if (this.isCancelled) return null;
        return diff(this.state.executionStartedAt, this.state.finishedAt);
    }

    /** registered → delivered */
    deliveryLeadTimeMs(): number | null {
        if (this.isCancelled) return null;
        return diff(this.state.registeredAt, this.state.deliveredAt);
    }

    toSnapshot(): ServiceOrderTimelineSnapshot {
        return { ...this.state };
    }
}
