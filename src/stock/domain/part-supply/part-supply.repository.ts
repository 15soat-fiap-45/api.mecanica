import type { PartSupply } from './part-supply.js';
import type { PartSupplyId } from './part-supply-id.js';
import type { PartCode } from '../../../shared/domain/part-code.js';

/**
 * Persistence contract for PartSupply.
 *
 * Implementations (e.g. Drizzle) MUST:
 * - Apply optimistic locking on save: UPDATE ... WHERE id = :id AND
 *   version = :version, incrementing version, and throw on 0 affected
 *   rows (aggregate.version exists for exactly this).
 * - When the use case also writes a SupplyReservation (reserve/cancel),
 *   commit both writes in the same database transaction — never half of
 *   the pair.
 */
export interface PartSupplyRepository {
    save(partSupply: PartSupply): Promise<void>;
    findById(id: PartSupplyId | string): Promise<PartSupply | null>;
    findByPartCode(partCode: PartCode | string): Promise<PartSupply | null>;
    /** Active parts ordered by part code. */
    findAllActive?(): Promise<PartSupply[]>;
}
