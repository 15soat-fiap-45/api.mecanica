import type { Email } from '../../../shared/domain/email.js';
import { PermissionDenied } from '../exceptions/permission-denied.js';
import type { Role } from './value-objects/role.js';

export type UserStatus = 'PENDING_FIRST_ACCESS' | 'ACTIVE' | 'DEACTIVATED';

export class User {
    constructor(
        public readonly email: Email,
        public readonly password: string,
        public readonly role: Role,
        public readonly status: UserStatus,
    ) {
        if (!password) throw new Error('Password hash is required');
    }

    activateWithPassword(hash: string): User {
        if (this.status !== 'PENDING_FIRST_ACCESS')
            throw new PermissionDenied();
        if (!hash) throw new Error('Password hash is required');
        return new User(this.email, hash, this.role, 'ACTIVE');
    }
}
