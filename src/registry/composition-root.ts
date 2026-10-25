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

export interface RegistryDependencies {
    customerRepository: CustomerRepository;
    vehicleRepository: VehicleRepository;
}

export interface RegistryUseCases {
    registerCustomer: UseCase<RegisterCustomerInput, RegisterCustomerOutput>;
    findCustomerByDocument: UseCase<
        FindCustomerByDocumentInput,
        FindCustomerByDocumentOutput
    >;
    registerVehicle: UseCase<RegisterVehicleInput, RegisterVehicleOutput>;
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
        registerCustomer,
        findCustomerByDocument,
        registerVehicle,
        findVehicleByPlate,
    };
}
