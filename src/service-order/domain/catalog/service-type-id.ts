import { EntityId } from '../../../shared/domain/entity-id.js';

export class ServiceTypeId extends EntityId {
    constructor(value?: string) {
        super(value ?? crypto.randomUUID());
    }

    static create(value?: string): ServiceTypeId {
        return new ServiceTypeId(value);
    }
}
