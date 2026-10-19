import type { DomainEvent } from '../../../shared/domain/domain-event.js';
import { CancelReservation } from '../use-cases/cancel-reservation.js';

/**
 * The service order event contract is declared in the Stock context
 * itself — the consumer defines the format it expects without importing
 * anything from the Service Order domain. Both contexts stay decoupled.
 */
export interface ServiceOrderCancelled extends DomainEvent {
    readonly eventName: 'service-order.cancelled';
}

/**
 * Handler for the Service Order "service order cancelled" event: delegates
 * to the CancelReservation use case, which cancels the order's open
 * reservations and returns the reserved quantities to the stock.
 *
 * Runs in its own transaction: consistency between contexts is eventual.
 * The use case is idempotent — reservations already CANCELLED or CONSUMED
 * are skipped if the event is delivered twice.
 */
export class ReleaseReservedSupplies {
    constructor(private readonly cancelReservation: CancelReservation) {}

    async handle(event: ServiceOrderCancelled): Promise<void> {
        await this.cancelReservation.execute({
            serviceOrderId: event.aggregateId,
        });
    }
}
