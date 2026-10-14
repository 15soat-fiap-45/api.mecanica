import { EntityId } from '../../../shared/domain/entity-id.js';

export class ReservaInsumoId extends EntityId {
    constructor(value?: string) {
        super(value ?? crypto.randomUUID());
    }

    static create(value?: string): ReservaInsumoId {
        return new ReservaInsumoId(value);
    }
}
