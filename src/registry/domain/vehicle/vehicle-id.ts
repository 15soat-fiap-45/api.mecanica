import { EntityId } from '../../../shared/domain/entity-id.js';

export class VehicleId extends EntityId {
    constructor(value?: string) {
        super(value ?? crypto.randomUUID());
    }

    static create(value?: string): VehicleId {
        return new VehicleId(value);
    }
}
