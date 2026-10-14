import { EntityId } from '../../../shared/domain/entity-id.js';

export class BudgetId extends EntityId {
    constructor(value?: string) {
        super(value ?? crypto.randomUUID());
    }

    static create(value?: string): BudgetId {
        return new BudgetId(value);
    }
}
