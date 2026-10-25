import type { FastifyInstance, FastifyReply } from 'fastify';
import { FirstAccessNotAllowed } from '../../application/exceptions/first-access-not-allowed.js';
import { FirstAccessRequired } from '../../application/exceptions/first-access-required.js';
import { InvalidCredentials } from '../../application/exceptions/invalid-credentials.js';
import { PasswordReuse } from '../../application/exceptions/password-reuse.js';
import { UserAlreadyExistsError } from '../../application/exceptions/user-already-exists.js';
import type { FirstAccess } from '../../application/use-cases/first-access.js';
import type { LogIn } from '../../application/use-cases/log-in.js';
import type { PreRegisterUser } from '../../application/use-cases/pre-register-user.js';
import type { ResolveAuthenticatedUser } from '../../application/use-cases/resolve-authenticated-user.js';
import { PermissionDenied } from '../../domain/exceptions/permission-denied.js';
import { UserWithoutPermission } from '../../domain/exceptions/user-without-permission.js';
import { ApplicationException } from '../../../shared/application/application-exception.js';
import { DomainException } from '../../../shared/domain/domain-exception.js';
import { firstAccessBody, loginBody, registerBody } from './auth-schema.js';

export class AuthController {
    constructor(
        private readonly firstAccess: FirstAccess,
        private readonly logIn: LogIn,
        private readonly preRegister: PreRegisterUser,
        private readonly resolveUser: ResolveAuthenticatedUser,
    ) {}

    register(app: FastifyInstance): void {
        app.post('/auth/first-access', async (request, reply) => {
            const parsed = firstAccessBody.safeParse(request.body);
            if (!parsed.success)
                return reply.code(400).send({ message: 'Invalid request' });
            try {
                await this.firstAccess.execute(parsed.data);
                return reply.code(204).send();
            } catch (error) {
                return this.handleError(error, reply);
            }
        });
        app.post('/auth/login', async (request, reply) => {
            reply.header('Cache-Control', 'no-store');
            const parsed = loginBody.safeParse(request.body);
            if (!parsed.success)
                return reply.code(400).send({ message: 'Invalid request' });
            try {
                const token = await this.logIn.execute(parsed.data);
                return reply.send({ token });
            } catch (error) {
                return this.handleError(error, reply);
            }
        });
        app.post('/users', async (request, reply) => {
            reply.header('Cache-Control', 'no-store');
            const match = /^Bearer (\S+)$/.exec(
                request.headers.authorization ?? '',
            );
            if (!match)
                return reply
                    .code(401)
                    .send({ message: 'Authentication required' });
            const parsed = registerBody.safeParse(request.body);
            if (!parsed.success)
                return reply.code(400).send({ message: 'Invalid request' });
            try {
                const actor = await this.resolveUser.execute(match[1]!);
                const temporaryPassword = await this.preRegister.execute(
                    parsed.data,
                    actor,
                );
                return reply.code(201).send({ temporaryPassword });
            } catch (error) {
                return this.handleError(error, reply);
            }
        });
    }

    private handleError(error: unknown, reply: FastifyReply) {
        if (error instanceof InvalidCredentials)
            return reply.code(401).send({ message: error.message });
        if (error instanceof UserAlreadyExistsError)
            return reply.code(409).send({ message: error.message });
        if (
            error instanceof PermissionDenied ||
            error instanceof UserWithoutPermission ||
            error instanceof FirstAccessRequired ||
            error instanceof FirstAccessNotAllowed
        )
            return reply.code(403).send({ message: error.message });
        if (error instanceof DomainException || error instanceof PasswordReuse)
            return reply.code(400).send({ message: error.message });
        if (error instanceof ApplicationException)
            return reply.code(400).send({ message: error.message });
        throw error;
    }
}
