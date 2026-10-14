import type { SupplyReservation } from './supply-reservation.js';
import type { SupplyReservationId } from './supply-reservation-id.js';
import type { PartSupplyId } from '../part-supply/part-supply-id.js';

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
