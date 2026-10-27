import { Email } from '../../../shared/domain/email.js';
import { UserAlreadyExistsError } from '../exceptions/user-already-exists.js';
import { AccessPolicy } from '../../domain/services/access-policy.js';
import type { PasswordGenerator } from '../../domain/services/password-generator.js';
import type { PasswordHasher } from '../../domain/services/password-hasher.js';
import { User } from '../../domain/user/user.js';
import type { UserRepository } from '../../domain/user/user-repository.js';
import { Password } from '../../domain/user/value-objects/password.js';
import { Permission } from '../../domain/user/value-objects/permission.js';
import { Role } from '../../domain/user/value-objects/role.js';

export class PreRegisterUser {
    constructor(
        private readonly repository: UserRepository,
        private readonly hasher: PasswordHasher,
        private readonly generator: PasswordGenerator,
    ) {}

    async execute(
        input: { email: string; role: string },
        actor: User | null,
    ): Promise<string> {
        new AccessPolicy().require(
            actor,
            Permission.create(Permission.USUARIO_PRE_CADASTRAR),
        );

        const email = Email.create(input.email);
        const role = Role.create(input.role);
        if (await this.repository.findByEmail(email))
            throw new UserAlreadyExistsError();

        const temporaryPassword = Password.create(this.generator.generate());
        const hash = await this.hasher.hash(temporaryPassword.value);
        await this.repository.save(
            new User(email, hash, role, 'PENDING_FIRST_ACCESS'),
        );
        return temporaryPassword.value;
    }
}
