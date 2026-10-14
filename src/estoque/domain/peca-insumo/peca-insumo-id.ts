import { EntityId } from '../../../shared/domain/entity-id.js';

export class PecaInsumoId extends EntityId {
    constructor(value?: string) {
        super(value ?? crypto.randomUUID());
    }

    static create(value?: string): PecaInsumoId {
        return new PecaInsumoId(value);
    }
}
