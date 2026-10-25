import { Email } from '../../../shared/domain/email.js';
import { FirstAccessNotAllowed } from '../exceptions/first-access-not-allowed.js';
import { InvalidCredentials } from '../exceptions/invalid-credentials.js';
import { PasswordReuse } from '../exceptions/password-reuse.js';
import type { PasswordHasher } from '../../domain/services/password-hasher.js';
import type { UserRepository } from '../../domain/user/user-repository.js';
import { Password } from '../../domain/user/value-objects/password.js';

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
        const parsed = Email.parse(input.email);
        if (!parsed.ok) throw new InvalidCredentials();
        const user = await this.repository.findByEmail(parsed.value);
        if (!user) throw new InvalidCredentials();
        if (
            !(await this.hasher.verify(input.temporaryPassword, user.password))
        ) {
            throw new InvalidCredentials();
        }
        if (user.status !== 'PENDING_FIRST_ACCESS') {
            throw new FirstAccessNotAllowed();
        }
        const password = Password.create(input.newPassword);
        if (password.value === input.temporaryPassword) {
            throw new PasswordReuse();
        }
        await this.repository.save(
            user.activateWithPassword(await this.hasher.hash(password.value)),
        );
    }
}
