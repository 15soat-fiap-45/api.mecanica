import { Email } from '../../../shared/domain/email.js';
import { PermissionDenied } from '../../domain/exceptions/permission-denied.js';
import type { TokenService } from '../token-service.js';
import type { User } from '../../domain/user/user.js';
import type { UserRepository } from '../../domain/user/user-repository.js';

export class ResolveAuthenticatedUser {
    constructor(
        private readonly repository: UserRepository,
        private readonly jwt: TokenService,
    ) {}

    async execute(token: string): Promise<User> {
        const email = await this.jwt.verify(token);
        if (!email) throw new PermissionDenied();
        const parsed = Email.parse(email);
        if (!parsed.ok) throw new PermissionDenied();
        const user = await this.repository.findByEmail(parsed.value);
        if (!user || user.status !== 'ACTIVE') throw new PermissionDenied();
        return user;
    }
}
