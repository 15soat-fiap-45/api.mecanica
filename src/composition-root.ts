import type { EventBus } from './shared/application/event-bus.js';
import type { ActorResolver } from './service-order/application/ports/actor-resolver.js';
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

import type { ServiceOrderDependencies } from './service-order/composition-root.js';
export type { ServiceOrderDependencies } from './service-order/composition-root.js';
import type { CustomerRepository } from './registry/domain/customer/customer.repository.js';
import type { VehicleRepository } from './registry/domain/vehicle/vehicle.repository.js';
import { registryCompositionRoot } from './registry/composition-root.js';
import { RegisterServiceOrder } from './service-order/application/use-cases/register-service-order.js';
import { AddSupplyToServiceOrder } from './service-order/application/use-cases/add-supply-to-service-order.js';
import { ApproveBudget } from './service-order/application/use-cases/approve-budget.js';
import { RegisterSupplyUsage } from './service-order/application/use-cases/register-supply-usage.js';
import { CancelServiceOrder } from './service-order/application/use-cases/cancel-service-order.js';
import { MoveServiceOrderToApproved } from './service-order/application/handlers/move-service-order-to-approved.js';
import type { BudgetApproved } from './service-order/domain/budget/events/budget-approved.js';
import type { UseCase } from './shared/application/use-case.js';
import type {
    RegisterPartSupplyInput,
    RegisterPartSupplyOutput,
} from './stock/application/use-cases/register-part-supply.js';
import type {
    RegisterStockEntryInput,
    RegisterStockEntryOutput,
} from './stock/application/use-cases/register-stock-entry.js';
import type {
    ReserveSupplyInput,
    ReserveSupplyOutput,
} from './stock/application/use-cases/reserve-supply.js';
import type {
    CancelReservationInput,
    CancelReservationOutput,
} from './stock/application/use-cases/cancel-reservation.js';
import type {
    WriteOffStockInput,
    WriteOffStockOutput,
} from './stock/application/use-cases/write-off-stock.js';

export interface StockUseCases {
    actorResolver?: ActorResolver | undefined;
    registerPartSupply: UseCase<RegisterPartSupplyInput, RegisterPartSupplyOutput>;
    registerStockEntry: UseCase<
        RegisterStockEntryInput,
        RegisterStockEntryOutput
    >;
    reserveSupply: UseCase<ReserveSupplyInput, ReserveSupplyOutput>;
    writeOffStock: UseCase<WriteOffStockInput, WriteOffStockOutput>;
    cancelReservation: UseCase<
        CancelReservationInput,
        CancelReservationOutput
    >;
}
import type { BusinessIntelligenceDependencies } from './business-intelligence/composition-root.js';
export type { BusinessIntelligenceDependencies } from './business-intelligence/composition-root.js';

export interface StockDependencies {
    partSupplyRepository: PartSupplyRepository;
    reservationRepository: SupplyReservationRepository;
    actorResolver?: ActorResolver | undefined;
}

export interface RegistryDependencies {
    customerRepository: CustomerRepository;
    vehicleRepository: VehicleRepository;
}

export type ApplicationDependencies = StockDependencies &
    ServiceOrderDependencies &
    RegistryDependencies &
    Partial<BusinessIntelligenceDependencies>;

export function stockCompositionRoot(
    eventBus: EventBus,
    deps: StockDependencies,
): StockUseCases {
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

    return {
        actorResolver: deps.actorResolver,
        registerPartSupply,
        registerStockEntry,
        reserveSupply,
        writeOffStock,
        cancelReservation,
    };
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
export function compositionRoot(
    eventBus: EventBus,
    deps: ApplicationDependencies,
) {
    const registry = registryCompositionRoot(eventBus, {
        customerRepository: deps.customerRepository,
        vehicleRepository: deps.vehicleRepository,
    });

    const stock = stockCompositionRoot(eventBus, deps);

    // Service order use cases
    const registerServiceOrder = new RegisterServiceOrder(
        deps.serviceOrderRepository,
        deps.vehicleContacts,
        eventBus,
    );
    const addSupplyToServiceOrder = new AddSupplyToServiceOrder(
        deps.serviceOrderRepository,
        eventBus,
    );
    const approveBudget = new ApproveBudget(deps.budgetRepository, eventBus);
    const registerSupplyUsage = new RegisterSupplyUsage(
        deps.serviceOrderRepository,
        eventBus,
    );
    const cancelServiceOrder = new CancelServiceOrder(
        deps.serviceOrderRepository,
        eventBus,
    );

    // Policies
    const moveServiceOrderToApproved = new MoveServiceOrderToApproved(
        deps.serviceOrderRepository,
    );
    eventBus.subscribe<BudgetApproved>(
        'service-order.budget-approved',
        (event) => moveServiceOrderToApproved.handle(event),
    );

    return {
        ...registry,
        ...stock,
        registerServiceOrder,
        addSupplyToServiceOrder,
        approveBudget,
        registerSupplyUsage,
        cancelServiceOrder,
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
