import { ApplicationException } from '../../../shared/application/application-exception.js';
import type { UseCase } from '../../../shared/application/use-case.js';
import type { ServiceRepository } from '../../domain/catalog/service.repository.js';
import { ServiceType } from '../../domain/catalog/service-type.js';
import type { ServiceTypeRepository } from '../../domain/catalog/service-type.repository.js';

export class ServiceTypeNotFoundError extends ApplicationException {
    constructor() {
        super('Service type not found.');
    }
}

export class ServiceTypeAlreadyExistsError extends ApplicationException {
    constructor() {
        super('A service type with this name already exists.');
    }
}

export class ServiceTypeInUseConflictError extends ApplicationException {
    constructor() {
        super('Cannot delete a service type while services are linked to it.');
    }
}

export interface ServiceTypeOutput {
    id: string;
    name: string;
}

const toOutput = (serviceType: ServiceType): ServiceTypeOutput => ({
    id: serviceType.id.value,
    name: serviceType.name,
});

export class RegisterServiceType implements UseCase<
    { name: string },
    ServiceTypeOutput
> {
    constructor(private readonly serviceTypes: ServiceTypeRepository) {}

    async execute(input: { name: string }): Promise<ServiceTypeOutput> {
        const serviceType = ServiceType.create({ name: input.name });
        if (await this.serviceTypes.findByName(serviceType.name))
            throw new ServiceTypeAlreadyExistsError();
        await this.serviceTypes.save(serviceType);
        return toOutput(serviceType);
    }
}

export class UpdateServiceType implements UseCase<
    { id: string; name: string },
    ServiceTypeOutput
> {
    constructor(private readonly serviceTypes: ServiceTypeRepository) {}

    async execute(input: {
        id: string;
        name: string;
    }): Promise<ServiceTypeOutput> {
        const serviceType = await this.serviceTypes.findById(input.id);
        if (!serviceType) throw new ServiceTypeNotFoundError();
        serviceType.rename(input.name);
        const homonym = await this.serviceTypes.findByName(serviceType.name);
        if (homonym && !homonym.id.equals(serviceType.id))
            throw new ServiceTypeAlreadyExistsError();
        await this.serviceTypes.update(serviceType);
        return toOutput(serviceType);
    }
}

export class DeleteServiceType implements UseCase<{ id: string }, void> {
    constructor(
        private readonly serviceTypes: ServiceTypeRepository,
        private readonly services: ServiceRepository,
    ) {}

    async execute(input: { id: string }): Promise<void> {
        const serviceType = await this.serviceTypes.findById(input.id);
        if (!serviceType) throw new ServiceTypeNotFoundError();
        if (await this.services.existsWithServiceType(serviceType.id))
            throw new ServiceTypeInUseConflictError();
        await this.serviceTypes.delete(serviceType.id);
    }
}

export class FindServiceType implements UseCase<
    { id: string },
    ServiceTypeOutput
> {
    constructor(private readonly serviceTypes: ServiceTypeRepository) {}

    async execute(input: { id: string }): Promise<ServiceTypeOutput> {
        const serviceType = await this.serviceTypes.findById(input.id);
        if (!serviceType) throw new ServiceTypeNotFoundError();
        return toOutput(serviceType);
    }
}

export class ListServiceTypes implements UseCase<void, ServiceTypeOutput[]> {
    constructor(private readonly serviceTypes: ServiceTypeRepository) {}

    async execute(): Promise<ServiceTypeOutput[]> {
        return (await this.serviceTypes.findAll()).map(toOutput);
    }
}
