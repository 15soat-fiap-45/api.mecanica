import { and, eq, gte, isNotNull, lte, type SQL } from 'drizzle-orm';
import {
    ServiceOrderTimeline,
    type ServiceOrderTimelineSnapshot,
} from '../../../business-intelligence/domain/service-order-timeline/service-order-timeline.js';
import type {
    PeriodFilter,
    ServiceOrderTimelineRepository,
} from '../../../business-intelligence/domain/service-order-timeline/service-order-timeline.repository.js';
import { db } from '../connection.js';
import { biServiceOrderTimelines } from '../schema.js';

type Row = typeof biServiceOrderTimelines.$inferSelect;

const toDomain = (row: Row): ServiceOrderTimeline =>
    ServiceOrderTimeline.restore({
        serviceOrderId: row.serviceOrderId,
        registeredAt: row.registeredAt,
        executionStartedAt: row.executionStartedAt,
        finishedAt: row.finishedAt,
        deliveredAt: row.deliveredAt,
        cancelledAt: row.cancelledAt,
    });

const toRow = (snapshot: ServiceOrderTimelineSnapshot) => ({
    serviceOrderId: snapshot.serviceOrderId,
    registeredAt: snapshot.registeredAt,
    executionStartedAt: snapshot.executionStartedAt,
    finishedAt: snapshot.finishedAt,
    deliveredAt: snapshot.deliveredAt,
    cancelledAt: snapshot.cancelledAt,
    updatedAt: new Date(),
});

export class DrizzleServiceOrderTimelineRepository
    implements ServiceOrderTimelineRepository
{
    constructor(private readonly database: typeof db = db) {}

    async findById(
        serviceOrderId: string,
    ): Promise<ServiceOrderTimeline | null> {
        const [row] = await this.database
            .select()
            .from(biServiceOrderTimelines)
            .where(eq(biServiceOrderTimelines.serviceOrderId, serviceOrderId))
            .limit(1);
        return row ? toDomain(row) : null;
    }

    async save(timeline: ServiceOrderTimeline): Promise<void> {
        const row = toRow(timeline.toSnapshot());
        await this.database
            .insert(biServiceOrderTimelines)
            .values(row)
            .onConflictDoUpdate({
                target: biServiceOrderTimelines.serviceOrderId,
                set: row,
            });
    }

    async findFinishedBetween(
        period: PeriodFilter,
    ): Promise<ServiceOrderTimeline[]> {
        const conditions: SQL[] = [
            isNotNull(biServiceOrderTimelines.finishedAt),
        ];
        if (period.from) {
            conditions.push(gte(biServiceOrderTimelines.finishedAt, period.from));
        }
        if (period.to) {
            conditions.push(lte(biServiceOrderTimelines.finishedAt, period.to));
        }
        const rows = await this.database
            .select()
            .from(biServiceOrderTimelines)
            .where(and(...conditions));
        return rows.map(toDomain);
    }

    async findDeliveredBetween(
        period: PeriodFilter,
    ): Promise<ServiceOrderTimeline[]> {
        const conditions: SQL[] = [
            isNotNull(biServiceOrderTimelines.deliveredAt),
        ];
        if (period.from) {
            conditions.push(
                gte(biServiceOrderTimelines.deliveredAt, period.from),
            );
        }
        if (period.to) {
            conditions.push(
                lte(biServiceOrderTimelines.deliveredAt, period.to),
            );
        }
        const rows = await this.database
            .select()
            .from(biServiceOrderTimelines)
            .where(and(...conditions));
        return rows.map(toDomain);
    }
}
