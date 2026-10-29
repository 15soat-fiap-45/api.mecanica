import rateLimit from '@fastify/rate-limit';
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
import {
    firstAccessBody,
    firstAccessResponses,
    loginBody,
    loginResponses,
    registerBody,
    registerResponses,
} from './auth-schema.js';

const credentialLimit = {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
};

// Schemas only feed the OpenAPI docs: handlers keep parsing bodies themselves
// (so /users answers 401 before 400) and replies are sent untouched.
const documentationOnly = {
    validatorCompiler: () => (data: unknown) => ({ value: data }),
    serializerCompiler: () => (data: unknown) => JSON.stringify(data),
};

export class AuthController {
    constructor(
        private readonly firstAccess: FirstAccess,
        private readonly logIn: LogIn,
        private readonly preRegister: PreRegisterUser,
        private readonly resolveUser: ResolveAuthenticatedUser,
    ) {}

    register(app: FastifyInstance): void {
        app.register(rateLimit, { global: false });
        app.after(() => {
            app.post(
                '/auth/first-access',
                {
                    ...credentialLimit,
                    ...documentationOnly,
                    schema: {
                        tags: ['Auth'],
                        summary: 'Primeiro acesso (troca da senha temporária)',
                        description:
                            'Troca a senha temporária de um usuário pré-cadastrado pela senha definitiva e o ativa. ' +
                            'Obrigatório antes do primeiro login, inclusive para o gerente inicial (admin@admin.com). ' +
                            'Limitado a 5 tentativas por minuto por IP.',
                        body: firstAccessBody,
                        response: firstAccessResponses,
                    },
                },
                async (request, reply) => {
                    const parsed = firstAccessBody.safeParse(request.body);
                    if (!parsed.success)
                        return reply
                            .code(400)
                            .send({ message: 'Invalid request' });
                    try {
                        await this.firstAccess.execute(parsed.data);
                        return reply.code(204).send();
                    } catch (error) {
                        return this.handleError(error, reply);
                    }
                },
            );
            app.post(
                '/auth/login',
                {
                    ...credentialLimit,
                    ...documentationOnly,
                    schema: {
                        tags: ['Auth'],
                        summary: 'Login',
                        description:
                            'Autentica o usuário com e-mail e senha e retorna um JWT válido por 4 horas. ' +
                            'Use o token no botão Authorize para acessar as rotas protegidas. ' +
                            'Limitado a 5 tentativas por minuto por IP.',
                        body: loginBody,
                        response: loginResponses,
                    },
                },
                async (request, reply) => {
                    reply.header('Cache-Control', 'no-store');
                    const parsed = loginBody.safeParse(request.body);
                    if (!parsed.success)
                        return reply
                            .code(400)
                            .send({ message: 'Invalid request' });
                    try {
                        const token = await this.logIn.execute(parsed.data);
                        return reply.send({ token });
                    } catch (error) {
                        return this.handleError(error, reply);
                    }
                },
            );
            app.post(
                '/users',
                {
                    ...documentationOnly,
                    schema: {
                        tags: ['Auth'],
                        summary: 'Pré-cadastrar usuário',
                        description:
                            'Cria um usuário com o papel informado e status PENDING_FIRST_ACCESS, retornando uma senha temporária. ' +
                            'Exige JWT de um usuário com a permissão USUARIO_PRE_CADASTRAR (GERENTE).',
                        security: [{ bearerAuth: [] }],
                        body: registerBody,
                        response: registerResponses,
                    },
                },
                async (request, reply) => {
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
                        return reply
                            .code(400)
                            .send({ message: 'Invalid request' });
                    try {
                        const actor = await this.resolveUser.execute(match[1]!);
                        const temporaryPassword =
                            await this.preRegister.execute(parsed.data, actor);
                        return reply.code(201).send({ temporaryPassword });
                    } catch (error) {
                        return this.handleError(error, reply);
                    }
                },
            );
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
