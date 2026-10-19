import type { SupplyReservation } from './supply-reservation.js';
import type { SupplyReservationId } from './supply-reservation-id.js';
import type { PartSupplyId } from '../part-supply/part-supply-id.js';

/**
 * Persistence contract for SupplyReservation.
 *
 * Implementations (e.g. Drizzle) MUST:
 * - Apply optimistic locking on save: UPDATE ... WHERE id = :id AND
 *   version = :version, incrementing version, and throw on 0 affected
 *   rows (aggregate.version exists for exactly this).
 * - Enforce a UNIQUE index on (service_order_id, part_supply_id) for OPEN
 *   reservations (status PENDING/CONFIRMED) — e.g. a partial unique index
 *   WHERE status IN ('PENDING', 'CONFIRMED') — so two concurrent deliveries
 *   of the same event cannot both insert a reservation for the same
 *   order + supply.
 * - Commit reservation saves in the same database transaction as the
 *   corresponding PartSupply writes when a use case updates both
 *   (reserve/cancel).
 */
export interface SupplyReservationRepository {
    save(reservation: SupplyReservation): Promise<void>;
    findById(
        id: SupplyReservationId | string,
    ): Promise<SupplyReservation | null>;
    findByPartSupplyId(
        partSupplyId: PartSupplyId | string,
    ): Promise<SupplyReservation[]>;
    findByServiceOrderId(serviceOrderId: string): Promise<SupplyReservation[]>;
    findByServiceOrderIdAndPartSupply(
        serviceOrderId: string,
        partSupplyId: PartSupplyId | string,
    ): Promise<SupplyReservation | null>;
}
