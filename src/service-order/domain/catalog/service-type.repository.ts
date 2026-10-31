import type { ServiceType } from './service-type.js';
import type { ServiceTypeId } from './service-type-id.js';

export interface ServiceTypeRepository {
    save(serviceType: ServiceType): Promise<void>;
    update(serviceType: ServiceType): Promise<void>;
    delete(id: ServiceTypeId | string): Promise<void>;
    findById(id: ServiceTypeId | string): Promise<ServiceType | null>;
    findByName(name: string): Promise<ServiceType | null>;
    findAll(): Promise<ServiceType[]>;
}
