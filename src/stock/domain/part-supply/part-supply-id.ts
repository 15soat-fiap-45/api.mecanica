import { EntityId } from '../../../shared/domain/entity-id.js';

export class PartSupplyId extends EntityId {
    constructor(value?: string) {
        super(value ?? crypto.randomUUID());
    }

    static create(value?: string): PartSupplyId {
        return new PartSupplyId(value);
    }
}
