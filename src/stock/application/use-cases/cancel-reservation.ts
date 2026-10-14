import type { PartSupplyRepository } from '../../domain/part-supply/part-supply.repository.js';
import type { SupplyReservationRepository } from '../../domain/supply-reservation/supply-reservation.repository.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import type { UseCase } from '../../../shared/application/use-case.js';
import { PartSupplyNotFoundError } from './reserve-supply.js';

export interface CancelReservationInput {
    serviceOrderId: string;
}

export interface CancelledReservationItem {
    reservationId: string;
    partSupplyId: string;
    quantity: number;
    status: string;
}

export interface CancelReservationOutput {
    serviceOrderId: string;
    cancelledItems: CancelledReservationItem[];
}

/**
 * Cancels the service order's open reservations and gives the reserved
 * quantities back to the available stock: reserving deducted the quantity
 * up front, so cancelling must put it back on the shelf.
 *
 * Idempotent: reservations already CANCELLED or CONSUMED are skipped
 * (CONSUMED stock was already written off for good), so the
 * "service order cancelled" event may be delivered twice with no side
 * effects.
 *
 * Implementer's note: the reservation save and the PartSupply save must be
 * committed in the same transaction (see the repository contracts).
 */
export class CancelReservation implements UseCase<
    CancelReservationInput,
    CancelReservationOutput
> {
    constructor(
        private readonly partSupplyRepository: PartSupplyRepository,
        private readonly reservationRepository: SupplyReservationRepository,
        private readonly eventBus?: EventBus,
    ) {}

    async execute(
        input: CancelReservationInput,
    ): Promise<CancelReservationOutput> {
        const reservations =
            await this.reservationRepository.findByServiceOrderId(
                input.serviceOrderId,
            );

        const cancelledItems: CancelledReservationItem[] = [];

        for (const reservation of reservations) {
            if (
                reservation.status.value === 'CANCELLED' ||
                reservation.status.value === 'CONSUMED'
            ) {
                continue;
            }

            const partSupply = await this.partSupplyRepository.findById(
                reservation.partSupplyId,
            );
            // A reservation must always point to an existing part. Fail
            // loudly instead of skipping: the reservation would stay open
            // forever and silently lose stock. The handler is idempotent,
            // so a redelivery after the data is fixed completes the job.
            if (!partSupply) {
                throw new PartSupplyNotFoundError();
            }

            reservation.cancel();
            partSupply.registerEntry(reservation.quantity);

            await this.partSupplyRepository.save(partSupply);
            await this.reservationRepository.save(reservation);

            if (this.eventBus) {
                await this.eventBus.publish(partSupply.pullEvents());
            }

            cancelledItems.push({
                reservationId: reservation.id.value,
                partSupplyId: reservation.partSupplyId.value,
                quantity: reservation.quantity.value,
                status: reservation.status.value,
            });
        }

        return {
            serviceOrderId: input.serviceOrderId,
            cancelledItems,
        };
    }
}
