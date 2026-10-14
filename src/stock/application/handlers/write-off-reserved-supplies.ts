import type { DomainEvent } from '../../../shared/domain/domain-event.js';
import { WriteOffStock } from '../use-cases/write-off-stock.js';

/**
 * The service order event contract is declared in the Stock context
 * itself — the consumer defines the format it expects without importing
 * anything from the Service Order domain. Both contexts stay decoupled.
 */
export interface ServiceOrderFinished extends DomainEvent {
    readonly eventName: 'service-order.finished';
}

/**
 * Handler for the Service Order "service order finished" event: delegates
 * to the WriteOffStock use case, which consumes the order's reservations.
 *
 * Runs in its own transaction: consistency between contexts is eventual.
 * The use case is idempotent — reservations already CONSUMED or CANCELLED
 * are skipped if the event is delivered twice.
 */
export class WriteOffReservedSupplies {
    constructor(private readonly writeOffStock: WriteOffStock) {}

    async handle(event: ServiceOrderFinished): Promise<void> {
        await this.writeOffStock.execute({
            serviceOrderId: event.aggregateId,
        });
    }
}
