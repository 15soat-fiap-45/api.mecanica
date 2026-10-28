import type { RestockCycle } from './restock-cycle.js';

export interface RestockCycleFilter {
    partCode?: string | undefined;
    from?: Date | undefined;
    to?: Date | undefined;
}

export interface RestockCycleRepository {
    findOpenByPartCode(partCode: string): Promise<RestockCycle | null>;
    save(cycle: RestockCycle): Promise<void>;
    /** Closed cycles whose `closedAt` falls within `[from, to]` (inclusive). */
    findClosedBetween(filter: RestockCycleFilter): Promise<RestockCycle[]>;
    /** Currently open cycles (optionally filtered by `partCode`). */
    findOpen(filter?: {
        partCode?: string | undefined;
    }): Promise<RestockCycle[]>;
}
