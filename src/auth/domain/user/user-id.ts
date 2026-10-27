import { randomUUID } from 'node:crypto';
import { EntityId } from '../../../shared/domain/entity-id.js';

export class UserId extends EntityId {
    constructor(value?: string) {
        super(value?.toLowerCase() ?? randomUUID());
        if (
            !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
                this.value,
            )
        )
            throw new Error('User ID must be a UUIDv4');
    }
}
