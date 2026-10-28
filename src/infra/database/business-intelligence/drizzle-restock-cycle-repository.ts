import { and, eq, gte, isNotNull, isNull, lte, type SQL } from 'drizzle-orm';
import {
    RestockCycle,
    type RestockCycleSnapshot,
} from '../../../business-intelligence/domain/restock-cycle/restock-cycle.js';
import type {
    RestockCycleFilter,
    RestockCycleRepository,
} from '../../../business-intelligence/domain/restock-cycle/restock-cycle.repository.js';
import { db } from '../connection.js';
import { biRestockCycles } from '../schema.js';

type Row = typeof biRestockCycles.$inferSelect;

const toDomain = (row: Row): RestockCycle =>
    RestockCycle.restore({
        id: row.id,
        partCode: row.partCode,
        openedAt: row.openedAt,
        closedAt: row.closedAt,
        quantityAtOpen: row.quantityAtOpen,
        restockedQuantity: row.restockedQuantity,
    });

const toRow = (snapshot: RestockCycleSnapshot) => ({
    id: snapshot.id,
    partCode: snapshot.partCode,
    openedAt: snapshot.openedAt,
    closedAt: snapshot.closedAt,
    quantityAtOpen: snapshot.quantityAtOpen,
    restockedQuantity: snapshot.restockedQuantity,
});

export class DrizzleRestockCycleRepository implements RestockCycleRepository {
    constructor(private readonly database: typeof db = db) {}

    async findOpenByPartCode(partCode: string): Promise<RestockCycle | null> {
        const normalized = partCode.trim().toUpperCase();
        const [row] = await this.database
            .select()
            .from(biRestockCycles)
            .where(
                and(
                    eq(biRestockCycles.partCode, normalized),
                    isNull(biRestockCycles.closedAt),
                ),
            )
            .limit(1);
        return row ? toDomain(row) : null;
    }

    async save(cycle: RestockCycle): Promise<void> {
        const row = toRow(cycle.toSnapshot());
        await this.database
            .insert(biRestockCycles)
            .values(row)
            .onConflictDoUpdate({
                target: biRestockCycles.id,
                set: row,
            });
    }

    async findClosedBetween(
        filter: RestockCycleFilter,
    ): Promise<RestockCycle[]> {
        const conditions: SQL[] = [isNotNull(biRestockCycles.closedAt)];
        if (filter.partCode) {
            conditions.push(
                eq(
                    biRestockCycles.partCode,
                    filter.partCode.trim().toUpperCase(),
                ),
            );
        }
        if (filter.from) {
            conditions.push(gte(biRestockCycles.closedAt, filter.from));
        }
        if (filter.to) {
            conditions.push(lte(biRestockCycles.closedAt, filter.to));
        }
        const rows = await this.database
            .select()
            .from(biRestockCycles)
            .where(and(...conditions));
        return rows.map(toDomain);
    }

    async findOpen(filter?: {
        partCode?: string | undefined;
    }): Promise<RestockCycle[]> {
        const conditions: SQL[] = [isNull(biRestockCycles.closedAt)];
        if (filter?.partCode) {
            conditions.push(
                eq(
                    biRestockCycles.partCode,
                    filter.partCode.trim().toUpperCase(),
                ),
            );
        }
        const rows = await this.database
            .select()
            .from(biRestockCycles)
            .where(and(...conditions));
        return rows.map(toDomain);
    }
}
