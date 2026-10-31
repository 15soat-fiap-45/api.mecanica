import type { Service } from '../../domain/catalog/service.js';
import type { ServiceId } from '../../domain/catalog/service-id.js';
import type { ServiceRepository } from '../../domain/catalog/service.repository.js';
import type { ServiceType } from '../../domain/catalog/service-type.js';
import type { ServiceTypeId } from '../../domain/catalog/service-type-id.js';
import type { ServiceTypeRepository } from '../../domain/catalog/service-type.repository.js';

const idOf = (id: { value: string } | string) =>
    typeof id === 'string' ? id : id.value;

export class InMemoryServiceTypeRepository implements ServiceTypeRepository {
    readonly items = new Map<string, ServiceType>();

    async save(serviceType: ServiceType): Promise<void> {
        this.items.set(serviceType.id.value, serviceType);
    }

    async update(serviceType: ServiceType): Promise<void> {
        this.items.set(serviceType.id.value, serviceType);
    }

    async delete(id: ServiceTypeId | string): Promise<void> {
        this.items.delete(idOf(id));
    }

    async findById(id: ServiceTypeId | string): Promise<ServiceType | null> {
        return this.items.get(idOf(id)) ?? null;
    }

    async findByName(name: string): Promise<ServiceType | null> {
        return [...this.items.values()].find((t) => t.name === name) ?? null;
    }

    async findAll(): Promise<ServiceType[]> {
        return [...this.items.values()].sort((a, b) =>
            a.name.localeCompare(b.name),
        );
    }
}

export class InMemoryServiceRepository implements ServiceRepository {
    readonly items = new Map<string, Service>();

    async save(service: Service): Promise<void> {
        this.items.set(service.id.value, service);
    }

    async update(service: Service): Promise<void> {
        this.items.set(service.id.value, service);
    }

    async delete(id: ServiceId | string): Promise<void> {
        this.items.delete(idOf(id));
    }

    async findById(id: ServiceId | string): Promise<Service | null> {
        return this.items.get(idOf(id)) ?? null;
    }

    async findAll(
        filter: { serviceTypeId?: string | undefined } = {},
    ): Promise<Service[]> {
        return [...this.items.values()]
            .filter(
                (s) =>
                    !filter.serviceTypeId ||
                    s.serviceTypeId.value === filter.serviceTypeId,
            )
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    async existsWithServiceType(
        serviceTypeId: ServiceTypeId | string,
    ): Promise<boolean> {
        const typeId = idOf(serviceTypeId);
        return [...this.items.values()].some(
            (s) => s.serviceTypeId.value === typeId,
        );
    }
}
