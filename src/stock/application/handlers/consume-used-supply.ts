import type { DomainEvent } from '../../../shared/domain/domain-event.js';
import type { PartSupplyRepository } from '../../domain/part-supply/part-supply.repository.js';
import type { SupplyReservationRepository } from '../../domain/supply-reservation/supply-reservation.repository.js';
import { PartCode } from '../../../shared/domain/part-code.js';
import { PartSupplyNotFoundError } from '../use-cases/reserve-supply.js';

/**
 * The service order event contract is declared in the Stock context
 * itself — the consumer defines the format it expects without importing
 * anything from the Service Order domain. Both contexts stay decoupled.
 */
export interface SupplyUsed extends DomainEvent {
    readonly eventName: 'service-order.supply-used';
    readonly partCode: string;
    readonly quantity: number;
}

/**
 * Handler for the Service Order "supply used" event: the mechanic
 * installed the part, so its reservation is consumed right away.
 *
 * Without this, a reservation only became CONSUMED when the order
 * finished — and cancelling an in-progress order would put parts that
 * are already installed back on the shelf.
 *
 * Idempotent: CONSUMED (or CANCELLED) reservations are skipped, so the
 * event may be delivered twice with no side effects.
 */
export class ConsumeUsedSupply {
    constructor(
        private readonly partSupplyRepository: PartSupplyRepository,
        private readonly reservationRepository: SupplyReservationRepository,
    ) {}

    async handle(event: SupplyUsed): Promise<void> {
        const partCode = PartCode.create(event.partCode);

        const partSupply =
            await this.partSupplyRepository.findByPartCode(partCode);
        if (!partSupply) {
            throw new PartSupplyNotFoundError();
        }

        const reservation =
            await this.reservationRepository.findByServiceOrderIdAndPartSupply(
                event.aggregateId,
                partSupply.id,
            );
        if (!reservation) return;

        if (
            reservation.status.value === 'CONSUMED' ||
            reservation.status.value === 'CANCELLED'
        ) {
            return;
        }

        if (reservation.status.value === 'PENDING') {
            reservation.confirm();
        }
        reservation.consume();

        await this.reservationRepository.save(reservation);
    }
}
