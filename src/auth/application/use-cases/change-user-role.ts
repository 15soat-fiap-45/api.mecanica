import { Email } from '../../../shared/domain/email.js';
import { UserNotFound } from '../exceptions/user-not-found.js';
import { AccessPolicy } from '../../domain/services/access-policy.js';
import type { User } from '../../domain/user/user.js';
import type { UserManagementRepository } from '../../domain/user/user-repository.js';
import { Permission } from '../../domain/user/value-objects/permission.js';
import { Role } from '../../domain/user/value-objects/role.js';

export class ChangeUserRole {
    constructor(private readonly repository: UserManagementRepository) {}

    async execute(
        input: { email: string; role: string },
        actor: User | null,
    ): Promise<User> {
        new AccessPolicy().require(
            actor,
            Permission.create(Permission.USUARIO_GERENCIAR),
        );
        const changed = await this.repository.changeRoleAtomically(
            Email.create(input.email),
            Role.create(input.role),
        );
        if (!changed) throw new UserNotFound();
        return changed;
    }
}
