import { Email } from '../../../shared/domain/email.js';
import { PermissionDenied } from '../../domain/exceptions/permission-denied.js';
import type { PasswordHasher } from '../../domain/services/password-hasher.js';
import type { UserRepository } from '../../domain/user/user-repository.js';
import {
    InvalidPasswordException,
    Password,
} from '../../domain/user/value-objects/password.js';

export class FirstAccess {
    constructor(
        private readonly repository: UserRepository,
        private readonly hasher: PasswordHasher,
    ) {}

    async execute(input: {
        email: string;
        temporaryPassword: string;
        newPassword: string;
    }): Promise<void> {
        const user = await this.repository.findByEmail(
            Email.create(input.email),
        );
        if (
            !user ||
            user.status !== 'PENDING_FIRST_ACCESS' ||
            !(await this.hasher.verify(input.temporaryPassword, user.password))
        ) {
            throw new PermissionDenied();
        }
        const password = Password.create(input.newPassword);
        if (password.value === input.temporaryPassword) {
            throw new InvalidPasswordException(
                'New password must differ from temporary password',
            );
        }
        await this.repository.save(
            user.activateWithPassword(await this.hasher.hash(password.value)),
        );
    }
}
