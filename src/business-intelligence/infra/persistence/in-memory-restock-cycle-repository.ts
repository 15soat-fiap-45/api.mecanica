import {
    RestockCycle,
    type RestockCycleSnapshot,
} from '../../domain/restock-cycle/restock-cycle.js';
import type {
    RestockCycleFilter,
    RestockCycleRepository,
} from '../../domain/restock-cycle/restock-cycle.repository.js';

export class InMemoryRestockCycleRepository implements RestockCycleRepository {
    private readonly items = new Map<string, RestockCycleSnapshot>();

    async findOpenByPartCode(partCode: string): Promise<RestockCycle | null> {
        const normalized = partCode.trim().toUpperCase();
        for (const snapshot of this.items.values()) {
            if (
                snapshot.partCode === normalized &&
                snapshot.closedAt === null
            ) {
                return RestockCycle.restore(snapshot);
            }
        }
        return null;
    }

    async save(cycle: RestockCycle): Promise<void> {
        const snapshot = cycle.toSnapshot();
        this.items.set(snapshot.id, snapshot);
    }

    async findClosedBetween(
        filter: RestockCycleFilter,
    ): Promise<RestockCycle[]> {
        const normalizedPart = filter.partCode?.trim().toUpperCase();
        const results: RestockCycle[] = [];
        for (const snapshot of this.items.values()) {
            if (!snapshot.closedAt) continue;
            if (normalizedPart && snapshot.partCode !== normalizedPart) {
                continue;
            }
            const ms = snapshot.closedAt.getTime();
            if (filter.from && ms < filter.from.getTime()) continue;
            if (filter.to && ms > filter.to.getTime()) continue;
            results.push(RestockCycle.restore(snapshot));
        }
        return results;
    }

    async findOpen(filter?: {
        partCode?: string | undefined;
    }): Promise<RestockCycle[]> {
        const normalizedPart = filter?.partCode?.trim().toUpperCase();
        const results: RestockCycle[] = [];
        for (const snapshot of this.items.values()) {
            if (snapshot.closedAt !== null) continue;
            if (normalizedPart && snapshot.partCode !== normalizedPart) {
                continue;
            }
            results.push(RestockCycle.restore(snapshot));
        }
        return results;
    }
}
