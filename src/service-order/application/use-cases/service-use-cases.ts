import { ApplicationException } from '../../../shared/application/application-exception.js';
import type { UseCase } from '../../../shared/application/use-case.js';
import { Service } from '../../domain/catalog/service.js';
import type { ServiceRepository } from '../../domain/catalog/service.repository.js';
import type { ServiceTypeRepository } from '../../domain/catalog/service-type.repository.js';
import { ServiceTypeNotFoundError } from './service-type-use-cases.js';

export class ServiceNotFoundError extends ApplicationException {
    constructor() {
        super('Service not found.');
    }
}

export interface ServiceInput {
    name: string;
    description?: string | null | undefined;
    priceCents: number;
    serviceTypeId: string;
}

export interface ServiceOutput {
    id: string;
    name: string;
    description: string | null;
    priceCents: number;
    serviceType: { id: string; name: string };
}

async function toOutput(
    service: Service,
    serviceTypes: ServiceTypeRepository,
    names?: Map<string, string>,
): Promise<ServiceOutput> {
    const typeId = service.serviceTypeId.value;
    const name =
        names?.get(typeId) ?? (await serviceTypes.findById(typeId))?.name ?? '';
    return {
        id: service.id.value,
        name: service.name,
        description: service.description,
        priceCents: service.priceCents,
        serviceType: { id: typeId, name },
    };
}

async function requireServiceType(
    serviceTypes: ServiceTypeRepository,
    serviceTypeId: string,
): Promise<void> {
    if (!(await serviceTypes.findById(serviceTypeId)))
        throw new ServiceTypeNotFoundError();
}

export class RegisterService implements UseCase<ServiceInput, ServiceOutput> {
    constructor(
        private readonly services: ServiceRepository,
        private readonly serviceTypes: ServiceTypeRepository,
    ) {}

    async execute(input: ServiceInput): Promise<ServiceOutput> {
        const service = Service.create(input);
        await requireServiceType(this.serviceTypes, input.serviceTypeId);
        await this.services.save(service);
        return toOutput(service, this.serviceTypes);
    }
}

export class UpdateService implements UseCase<
    ServiceInput & { id: string },
    ServiceOutput
> {
    constructor(
        private readonly services: ServiceRepository,
        private readonly serviceTypes: ServiceTypeRepository,
    ) {}

    async execute(
        input: ServiceInput & { id: string },
    ): Promise<ServiceOutput> {
        const service = await this.services.findById(input.id);
        if (!service) throw new ServiceNotFoundError();
        service.update(input);
        await requireServiceType(this.serviceTypes, input.serviceTypeId);
        await this.services.update(service);
        return toOutput(service, this.serviceTypes);
    }
}

/**
 * A OS guarda nome e preço do serviço no momento da inclusão; por isso
 * excluir um serviço do catálogo não altera orçamentos já emitidos.
 */
export class DeleteService implements UseCase<{ id: string }, void> {
    constructor(private readonly services: ServiceRepository) {}

    async execute(input: { id: string }): Promise<void> {
        const service = await this.services.findById(input.id);
        if (!service) throw new ServiceNotFoundError();
        await this.services.delete(service.id);
    }
}

export class FindService implements UseCase<{ id: string }, ServiceOutput> {
    constructor(
        private readonly services: ServiceRepository,
        private readonly serviceTypes: ServiceTypeRepository,
    ) {}

    async execute(input: { id: string }): Promise<ServiceOutput> {
        const service = await this.services.findById(input.id);
        if (!service) throw new ServiceNotFoundError();
        return toOutput(service, this.serviceTypes);
    }
}

export class ListServices implements UseCase<
    { serviceTypeId?: string | undefined },
    ServiceOutput[]
> {
    constructor(
        private readonly services: ServiceRepository,
        private readonly serviceTypes: ServiceTypeRepository,
    ) {}

    async execute(input: {
        serviceTypeId?: string | undefined;
    }): Promise<ServiceOutput[]> {
        const [services, types] = await Promise.all([
            this.services.findAll({ serviceTypeId: input.serviceTypeId }),
            this.serviceTypes.findAll(),
        ]);
        const names = new Map(types.map((type) => [type.id.value, type.name]));
        return Promise.all(
            services.map((service) =>
                toOutput(service, this.serviceTypes, names),
            ),
        );
    }
}
