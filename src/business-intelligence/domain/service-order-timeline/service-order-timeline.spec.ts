import { describe, expect, it } from 'vitest';
import { ServiceOrderTimeline } from './service-order-timeline.js';

const at = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 0, minutes));
const MINUTE = 60_000;

describe('ServiceOrderTimeline', () => {
    it('starts empty, with no metrics', () => {
        const timeline = ServiceOrderTimeline.start('os-1');
        expect(timeline.serviceOrderId).toBe('os-1');
        expect(timeline.totalLeadTimeMs()).toBeNull();
        expect(timeline.executionTimeMs()).toBeNull();
        expect(timeline.deliveryLeadTimeMs()).toBeNull();
    });

    it('computes total, execution and delivery lead times', () => {
        const timeline = ServiceOrderTimeline.start('os-1');
        timeline.markRegistered(at(0));
        timeline.markExecutionStarted(at(30));
        timeline.markFinished(at(90));
        timeline.markDelivered(at(120));

        expect(timeline.totalLeadTimeMs()).toBe(90 * MINUTE);
        expect(timeline.executionTimeMs()).toBe(60 * MINUTE);
        expect(timeline.deliveryLeadTimeMs()).toBe(120 * MINUTE);
    });

    it('keeps the first timestamp of each milestone (idempotent)', () => {
        const timeline = ServiceOrderTimeline.start('os-1');
        timeline.markRegistered(at(0));
        timeline.markRegistered(at(10));
        timeline.markExecutionStarted(at(20));
        timeline.markExecutionStarted(at(50)); // resumed after a pause
        timeline.markFinished(at(80));
        timeline.markFinished(at(99));

        const snapshot = timeline.toSnapshot();
        expect(snapshot.registeredAt).toEqual(at(0));
        expect(snapshot.executionStartedAt).toEqual(at(20));
        expect(snapshot.finishedAt).toEqual(at(80));
    });

    it('excludes cancelled orders from every metric', () => {
        const timeline = ServiceOrderTimeline.start('os-1');
        timeline.markRegistered(at(0));
        timeline.markExecutionStarted(at(10));
        timeline.markFinished(at(20));
        timeline.markCancelled(at(30));

        expect(timeline.isCancelled).toBe(true);
        expect(timeline.totalLeadTimeMs()).toBeNull();
        expect(timeline.executionTimeMs()).toBeNull();
        expect(timeline.deliveryLeadTimeMs()).toBeNull();
    });

    it('reports null for inconsistent (negative) durations', () => {
        const timeline = ServiceOrderTimeline.start('os-1');
        timeline.markFinished(at(0));
        timeline.markRegistered(at(10));
        expect(timeline.totalLeadTimeMs()).toBeNull();
    });

    it('restores from and exports to a snapshot without sharing state', () => {
        const timeline = ServiceOrderTimeline.start('os-1');
        timeline.markRegistered(at(0));
        const snapshot = timeline.toSnapshot();
        const restored = ServiceOrderTimeline.restore(snapshot);
        restored.markFinished(at(5));

        expect(snapshot.finishedAt).toBeNull();
        expect(restored.totalLeadTimeMs()).toBe(5 * MINUTE);
    });
});
