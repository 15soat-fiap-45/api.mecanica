import type { EventBus } from './shared/application/event-bus.js';
import type { PartSupplyRepository } from './stock/domain/part-supply/part-supply.repository.js';
import type { SupplyReservationRepository } from './stock/domain/supply-reservation/supply-reservation.repository.js';
import { RegisterPartSupply } from './stock/application/use-cases/register-part-supply.js';
import { RegisterStockEntry } from './stock/application/use-cases/register-stock-entry.js';
import { ReserveSupply } from './stock/application/use-cases/reserve-supply.js';
import { WriteOffStock } from './stock/application/use-cases/write-off-stock.js';
import { CancelReservation } from './stock/application/use-cases/cancel-reservation.js';
import { CheckAvailability } from './stock/application/handlers/check-availability.js';
import type { AdditionalSuppliesIncluded } from './stock/application/handlers/check-availability.js';
import { WriteOffReservedSupplies } from './stock/application/handlers/write-off-reserved-supplies.js';
import type { ServiceOrderFinished } from './stock/application/handlers/write-off-reserved-supplies.js';
import { ReleaseReservedSupplies } from './stock/application/handlers/release-reserved-supplies.js';
import type { ServiceOrderCancelled } from './stock/application/handlers/release-reserved-supplies.js';
import { ConsumeUsedSupply } from './stock/application/handlers/consume-used-supply.js';
import type { SupplyUsed } from './stock/application/handlers/consume-used-supply.js';

import { serviceOrderCompositionRoot } from './service-order/composition-root.js';
import type { ServiceOrderDependencies } from './service-order/composition-root.js';
export type { ServiceOrderDependencies } from './service-order/composition-root.js';
import type { CustomerRepository } from './registry/domain/customer/customer.repository.js';
import type { VehicleRepository } from './registry/domain/vehicle/vehicle.repository.js';
import { registryCompositionRoot } from './registry/composition-root.js';
import {
    businessIntelligenceCompositionRoot,
    type BusinessIntelligenceDependencies,
} from './business-intelligence/composition-root.js';
export type { BusinessIntelligenceDependencies } from './business-intelligence/composition-root.js';

export interface StockDependencies {
    partSupplyRepository: PartSupplyRepository;
    reservationRepository: SupplyReservationRepository;
}

export interface RegistryDependencies {
    customerRepository: CustomerRepository;
    vehicleRepository: VehicleRepository;
}

export type ApplicationDependencies = StockDependencies &
    ServiceOrderDependencies &
    RegistryDependencies &
    Partial<BusinessIntelligenceDependencies>;

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
export function compositionRoot(
    eventBus: EventBus,
    deps: ApplicationDependencies,
) {
    const registry = registryCompositionRoot(eventBus, {
        customerRepository: deps.customerRepository,
        vehicleRepository: deps.vehicleRepository,
    });

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
    const cancelReservation = new CancelReservation(
        deps.partSupplyRepository,
        deps.reservationRepository,
        eventBus,
    );

    // Handlers for events from other contexts
    const checkAvailability = new CheckAvailability(reserveSupply, eventBus);
    const writeOffReservedSupplies = new WriteOffReservedSupplies(
        writeOffStock,
    );
    const releaseReservedSupplies = new ReleaseReservedSupplies(
        cancelReservation,
    );
    const consumeUsedSupply = new ConsumeUsedSupply(
        deps.partSupplyRepository,
        deps.reservationRepository,
    );

    eventBus.subscribe<AdditionalSuppliesIncluded>(
        'service-order.additional-supplies-included',
        (event) => checkAvailability.handle(event),
    );
    eventBus.subscribe<ServiceOrderFinished>(
        'service-order.finished',
        (event) => writeOffReservedSupplies.handle(event),
    );
    eventBus.subscribe<ServiceOrderCancelled>(
        'service-order.cancelled',
        (event) => releaseReservedSupplies.handle(event),
    );
    eventBus.subscribe<SupplyUsed>('service-order.supply-used', (event) =>
        consumeUsedSupply.handle(event),
    );

    const serviceOrder = serviceOrderCompositionRoot(eventBus, deps);
    const businessIntelligence =
        deps.timelineRepository && deps.restockCycleRepository
            ? businessIntelligenceCompositionRoot(eventBus, {
                  timelineRepository: deps.timelineRepository,
                  restockCycleRepository: deps.restockCycleRepository,
                  restockPolicy: deps.restockPolicy,
                  accessGuard: deps.accessGuard,
              })
            : undefined;

    return {
        ...registry,
        registerPartSupply,
        registerStockEntry,
        reserveSupply,
        writeOffStock,
        cancelReservation,
        ...serviceOrder,
        ...(businessIntelligence ?? {}),
    };
}

// Usage example (at application startup):
//
// const useCases = compositionRoot(eventBus, {
//     partSupplyRepository,
//     reservationRepository,
//     serviceOrderRepository,
//     budgetRepository,
// });
//
// await useCases.registerPartSupply.execute({
//     description: 'Front brake pad',
//     partCode: 'PAST-FREIO-01',
//     quantity: 10,
//     unitOfMeasure: 'UNIT',
// });
//
// await useCases.registerServiceOrder.execute({
//     description: 'Brake pads and fluid replacement',
// });
