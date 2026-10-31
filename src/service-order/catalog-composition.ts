import {
    DeleteService,
    FindService,
    ListServices,
    RegisterService,
    UpdateService,
} from './application/use-cases/service-use-cases.js';
import {
    DeleteServiceType,
    FindServiceType,
    ListServiceTypes,
    RegisterServiceType,
    UpdateServiceType,
} from './application/use-cases/service-type-use-cases.js';
import type { ServiceRepository } from './domain/catalog/service.repository.js';
import type { ServiceTypeRepository } from './domain/catalog/service-type.repository.js';

/** Catálogo de serviços (tipos de serviço e serviços com preço de tabela). */
export interface ServiceCatalogUseCases {
    registerServiceType: RegisterServiceType;
    updateServiceType: UpdateServiceType;
    deleteServiceType: DeleteServiceType;
    findServiceType: FindServiceType;
    listServiceTypes: ListServiceTypes;
    registerService: RegisterService;
    updateService: UpdateService;
    deleteService: DeleteService;
    findService: FindService;
    listServices: ListServices;
}

export function serviceCatalogUseCases(
    types: ServiceTypeRepository,
    services: ServiceRepository,
): ServiceCatalogUseCases {
    return {
        registerServiceType: new RegisterServiceType(types),
        updateServiceType: new UpdateServiceType(types),
        deleteServiceType: new DeleteServiceType(types, services),
        findServiceType: new FindServiceType(types),
        listServiceTypes: new ListServiceTypes(types),
        registerService: new RegisterService(services, types),
        updateService: new UpdateService(services, types),
        deleteService: new DeleteService(services),
        findService: new FindService(services, types),
        listServices: new ListServices(services, types),
    };
}
