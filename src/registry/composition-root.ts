import type { EventBus } from '../shared/application/event-bus.js';
import type { UseCase } from '../shared/application/use-case.js';
import {
    FindCustomerByDocument,
    type FindCustomerByDocumentInput,
    type FindCustomerByDocumentOutput,
} from './application/use-cases/find-customer-by-document.js';
import {
    FindVehicleByPlate,
    type FindVehicleByPlateInput,
    type FindVehicleByPlateOutput,
} from './application/use-cases/find-vehicle-by-plate.js';
import {
    RegisterCustomer,
    type RegisterCustomerInput,
    type RegisterCustomerOutput,
} from './application/use-cases/register-customer.js';
import {
    RegisterVehicle,
    type RegisterVehicleInput,
    type RegisterVehicleOutput,
} from './application/use-cases/register-vehicle.js';
import type { CustomerRepository } from './domain/customer/customer.repository.js';
import type { VehicleRepository } from './domain/vehicle/vehicle.repository.js';
import type { ActorResolver } from '../service-order/application/ports/actor-resolver.js';
import {
    DeleteCustomer,
    type DeleteCustomerInput,
} from './application/use-cases/delete-customer.js';
import {
    DeleteVehicle,
    type DeleteVehicleInput,
} from './application/use-cases/delete-vehicle.js';
import {
    UpdateCustomer,
    type UpdateCustomerInput,
    type UpdateCustomerOutput,
} from './application/use-cases/update-customer.js';
import {
    UpdateVehicle,
    type UpdateVehicleInput,
    type UpdateVehicleOutput,
} from './application/use-cases/update-vehicle.js';

export interface RegistryDependencies {
    customerRepository: CustomerRepository;
    vehicleRepository: VehicleRepository;
    actorResolver?: ActorResolver | undefined;
}

export interface RegistryUseCases {
    actorResolver?: ActorResolver | undefined;
    registerCustomer: UseCase<RegisterCustomerInput, RegisterCustomerOutput>;
    updateCustomer: UseCase<UpdateCustomerInput, UpdateCustomerOutput>;
    deleteCustomer: UseCase<DeleteCustomerInput, void>;
    findCustomerByDocument: UseCase<
        FindCustomerByDocumentInput,
        FindCustomerByDocumentOutput
    >;
    registerVehicle: UseCase<RegisterVehicleInput, RegisterVehicleOutput>;
    updateVehicle: UseCase<UpdateVehicleInput, UpdateVehicleOutput>;
    deleteVehicle: UseCase<DeleteVehicleInput, void>;
    findVehicleByPlate: UseCase<
        FindVehicleByPlateInput,
        FindVehicleByPlateOutput
    >;
}

export function registryCompositionRoot(
    eventBus: EventBus,
    deps: RegistryDependencies,
): RegistryUseCases {
    const registerCustomer = new RegisterCustomer(
        deps.customerRepository,
        eventBus,
    );
    const findCustomerByDocument = new FindCustomerByDocument(
        deps.customerRepository,
    );
    const registerVehicle = new RegisterVehicle(
        deps.vehicleRepository,
        deps.customerRepository,
        eventBus,
    );
    const findVehicleByPlate = new FindVehicleByPlate(deps.vehicleRepository);

    return {
        actorResolver: deps.actorResolver,
        registerCustomer,
        updateCustomer: new UpdateCustomer(deps.customerRepository),
        deleteCustomer: new DeleteCustomer(deps.customerRepository),
        findCustomerByDocument,
        registerVehicle,
        updateVehicle: new UpdateVehicle(deps.vehicleRepository),
        deleteVehicle: new DeleteVehicle(deps.vehicleRepository),
        findVehicleByPlate,
    };
}
