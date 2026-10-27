import { Email } from '../../../shared/domain/email.js';
import { UserNotFound } from '../exceptions/user-not-found.js';
import { AccessPolicy } from '../../domain/services/access-policy.js';
import type { User } from '../../domain/user/user.js';
import type { UserManagementRepository } from '../../domain/user/user-repository.js';
import { Permission } from '../../domain/user/value-objects/permission.js';

export class DeactivateUser {
    constructor(private readonly repository: UserManagementRepository) {}

    async execute(input: { email: string }, actor: User | null): Promise<User> {
        new AccessPolicy().require(
            actor,
            Permission.create(Permission.USUARIO_GERENCIAR),
        );
        const deactivated = await this.repository.deactivateAtomically(
            Email.create(input.email),
        );
        if (!deactivated) throw new UserNotFound();
        return deactivated;
    }
}
