import type { Email } from '../../../shared/domain/email.js';
import { AggregateRoot } from '../../../shared/domain/aggregate-root.js';
import { PermissionDenied } from '../exceptions/permission-denied.js';
import { UserId } from './user-id.js';
import type { Role } from './value-objects/role.js';

export const USER_STATUSES = [
    'PENDING_FIRST_ACCESS',
    'ACTIVE',
    'DEACTIVATED',
] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export class User extends AggregateRoot<UserId> {
    constructor(
        public readonly email: Email,
        public readonly password: string,
        public readonly role: Role,
        public readonly status: UserStatus,
        id?: UserId | string,
    ) {
        super(id instanceof UserId ? id : new UserId(id));
        if (!password) throw new Error('Password hash is required');
    }

    activateWithPassword(hash: string): User {
        if (this.status !== 'PENDING_FIRST_ACCESS')
            throw new PermissionDenied();
        if (!hash) throw new Error('Password hash is required');
        return new User(this.email, hash, this.role, 'ACTIVE', this.id);
    }
}
