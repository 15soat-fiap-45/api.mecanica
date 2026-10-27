import type { Email } from '../../../shared/domain/email.js';
import type { User } from './user.js';
import type { Role } from './value-objects/role.js';

export interface UserRepository {
    save(user: User): Promise<void>;
    findByEmail(email: Email): Promise<User | null>;
}

export interface UserManagementRepository extends UserRepository {
    changeRoleAtomically(email: Email, role: Role): Promise<User | null>;
    deactivateAtomically(email: Email): Promise<User | null>;
}
