import { randomBytes } from 'node:crypto';
import { ApplicationException } from '../../../shared/application/application-exception.js';
import { Email } from '../../../shared/domain/email.js';
import type { PasswordHasher } from '../../domain/services/password-hasher.js';
import { User } from '../../domain/user/user.js';
import type { UserRepository } from '../../domain/user/user-repository.js';
import { Password } from '../../domain/user/value-objects/password.js';
import { Role } from '../../domain/user/value-objects/role.js';

export class UserAlreadyExistsError extends ApplicationException {
    constructor() {
        super('User with this email already exists');
    }
}

export class PreRegisterUser {
    constructor(
        private readonly repository: UserRepository,
        private readonly hasher: PasswordHasher,
    ) {}

    async execute(input: { email: string; role: string }): Promise<string> {
        const email = Email.create(input.email);
        const role = Role.create(input.role);
        if (await this.repository.findByEmail(email))
            throw new UserAlreadyExistsError();

        const temporaryPassword = Password.create(
            randomBytes(18).toString('hex'),
        );
        const hash = await this.hasher.hash(temporaryPassword.value);
        await this.repository.save(
            new User(email, hash, role, 'PENDING_FIRST_ACCESS'),
        );
        return temporaryPassword.value;
    }
}
