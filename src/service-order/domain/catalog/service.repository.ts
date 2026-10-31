import type { ServiceTypeId } from './service-type-id.js';
import type { Service } from './service.js';
import type { ServiceId } from './service-id.js';

export interface ServiceRepository {
    save(service: Service): Promise<void>;
    update(service: Service): Promise<void>;
    delete(id: ServiceId | string): Promise<void>;
    findById(id: ServiceId | string): Promise<Service | null>;
    findAll(filter?: {
        serviceTypeId?: string | undefined;
    }): Promise<Service[]>;
    existsWithServiceType(
        serviceTypeId: ServiceTypeId | string,
    ): Promise<boolean>;
}
