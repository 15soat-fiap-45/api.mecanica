import { EntityId } from '../../../shared/domain/entity-id.js';

export class ServiceId extends EntityId {
    constructor(value?: string) {
        super(value ?? crypto.randomUUID());
    }

    static create(value?: string): ServiceId {
        return new ServiceId(value);
    }
}
