import { Email } from '../../../shared/domain/email.js';
import { PermissionDenied } from '../../domain/exceptions/permission-denied.js';
import type { TokenService } from '../token-service.js';
import { InvalidCredentials } from '../exceptions/invalid-credentials.js';
import { FirstAccessRequired } from '../exceptions/first-access-required.js';
import type { PasswordHasher } from '../../domain/services/password-hasher.js';
import type { UserRepository } from '../../domain/user/user-repository.js';

export class LogIn {
    private dummyHash?: Promise<string>;

    constructor(
        private readonly repository: UserRepository,
        private readonly hasher: PasswordHasher,
        private readonly jwt: TokenService,
    ) {}

    async execute(input: { email: string; password: string }): Promise<string> {
        const parsed = Email.parse(input.email);
        if (!parsed.ok) throw new InvalidCredentials();

        const dummyHash = await (this.dummyHash ??= this.hasher.hash(
            'NotARealAccountPassword',
        ));
        const user = await this.repository.findByEmail(parsed.value);
        if (!user) {
            await this.hasher.verify(input.password, dummyHash);
            throw new InvalidCredentials();
        }
        if (!(await this.hasher.verify(input.password, user.password))) {
            throw new InvalidCredentials();
        }
        if (user.status === 'PENDING_FIRST_ACCESS') {
            throw new FirstAccessRequired();
        }
        if (user.status !== 'ACTIVE') throw new PermissionDenied();
        return this.jwt.sign(user.email.value);
    }
}
