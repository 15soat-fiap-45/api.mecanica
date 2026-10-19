import { EntityId } from '../../../shared/domain/entity-id.js';

export class SupplyReservationId extends EntityId {
    constructor(value?: string) {
        super(value ?? crypto.randomUUID());
    }

    static create(value?: string): SupplyReservationId {
        return new SupplyReservationId(value);
    }
}
