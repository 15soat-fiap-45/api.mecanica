import type { EventBus } from './shared/application/event-bus.js';
import type { PartSupplyRepository } from './stock/domain/part-supply/part-supply.repository.js';
import type { SupplyReservationRepository } from './stock/domain/supply-reservation/supply-reservation.repository.js';
import { RegisterPartSupply } from './stock/application/use-cases/register-part-supply.js';
import { RegisterStockEntry } from './stock/application/use-cases/register-stock-entry.js';
import { ReserveSupply } from './stock/application/use-cases/reserve-supply.js';
import { WriteOffStock } from './stock/application/use-cases/write-off-stock.js';
import { CheckAvailability } from './stock/application/handlers/check-availability.js';
import type { AdditionalSuppliesIncluded } from './stock/application/handlers/check-availability.js';
import { WriteOffReservedSupplies } from './stock/application/handlers/write-off-reserved-supplies.js';
import type { ServiceOrderFinished } from './stock/application/handlers/write-off-reserved-supplies.js';

export interface StockDependencies {
    partSupplyRepository: PartSupplyRepository;
    reservationRepository: SupplyReservationRepository;
}

/**
 * Composition root for the Stock context: instantiates the use cases and
 * wires each handler to its event on the bus.
 *
 * - The service order event contracts are declared inside Stock itself
 *   (see the handlers), without importing classes from the Service Order
 *   context.
 * - One transaction per handler: consistency between contexts is eventual.
 * - Idempotency is enforced by the use cases (service order + supply key).
 */
export function compositionRoot(eventBus: EventBus, deps: StockDependencies) {
    // Use cases
    const registerPartSupply = new RegisterPartSupply(
        deps.partSupplyRepository,
        eventBus,
    );
    const registerStockEntry = new RegisterStockEntry(
        deps.partSupplyRepository,
        eventBus,
    );
    const reserveSupply = new ReserveSupply(
        deps.partSupplyRepository,
        deps.reservationRepository,
        eventBus,
    );
    const writeOffStock = new WriteOffStock(deps.reservationRepository);

    // Handlers for events from other contexts
    const checkAvailability = new CheckAvailability(reserveSupply, eventBus);
    const writeOffReservedSupplies = new WriteOffReservedSupplies(
        writeOffStock,
    );

    eventBus.subscribe<AdditionalSuppliesIncluded>(
        'service-order.additional-supplies-included',
        (event) => checkAvailability.handle(event),
    );
    eventBus.subscribe<ServiceOrderFinished>(
        'service-order.finished',
        (event) => writeOffReservedSupplies.handle(event),
    );

    return {
        registerPartSupply,
        registerStockEntry,
        reserveSupply,
        writeOffStock,
    };
}

// Usage example (at application startup):
//
// const useCases = compositionRoot(eventBus, {
//     partSupplyRepository,
//     reservationRepository,
// });
//
// await useCases.registerPartSupply.execute({
//     description: 'Front brake pad',
//     partCode: 'PAST-FREIO-01',
//     quantity: 10,
//     unitOfMeasure: 'UNIT',
// });
