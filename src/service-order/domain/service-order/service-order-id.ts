import { EntityId } from '../../../shared/domain/entity-id.js';

export class ServiceOrderId extends EntityId {
    constructor(value?: string) {
        super(value ?? crypto.randomUUID());
    }

    static create(value?: string): ServiceOrderId {
        return new ServiceOrderId(value);
    }
}
