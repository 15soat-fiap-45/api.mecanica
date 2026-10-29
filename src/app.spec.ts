import { describe, expect, it, vi } from 'vitest';
import { Email } from './shared/domain/email.js';
import { FirstAccess } from './auth/application/use-cases/first-access.js';
import { LogIn } from './auth/application/use-cases/log-in.js';
import { PreRegisterUser } from './auth/application/use-cases/pre-register-user.js';
import { ResolveAuthenticatedUser } from './auth/application/use-cases/resolve-authenticated-user.js';
import { User } from './auth/domain/user/user.js';
import type { UserRepository } from './auth/domain/user/user-repository.js';
import { Role } from './auth/domain/user/value-objects/role.js';
import { AuthController } from './auth/infra/http/auth-controller.js';
import { Argon2PasswordHasher } from './auth/infra/security/argon2-password-hasher.js';
import { JoseTokenService } from './auth/infra/security/jose-token-service.js';
import { SecurePasswordGenerator } from './auth/infra/security/secure-password-generator.js';
import { buildApp } from './app.js';
import { CustomerHasVehiclesError } from './infra/database/registry/registry-persistence-errors.js';

vi.mock('./infra/database/connection.js', () => ({
    db: { execute: async () => [] },
    pool: { end: async () => {} },
}));

describe('buildApp auth routes', () => {
    it('allows the initial manager to activate, log in and pre-register a user', async () => {
        const users = new Map<string, User>();
        const repository: UserRepository = {
            findByEmail: async (email) => users.get(email.value) ?? null,
            save: async (user) => {
                users.set(user.email.value, user);
            },
        };
        const hasher = new Argon2PasswordHasher();
        const jwt = new JoseTokenService(
            'a-secure-signing-key-with-32-bytes-minimum',
        );
        users.set(
            'admin@admin.com',
            new User(
                Email.create('admin@admin.com'),
                await hasher.hash('TempPass123'),
                Role.create('GERENTE'),
                'PENDING_FIRST_ACCESS',
            ),
        );
        const auth = new AuthController(
            new FirstAccess(repository, hasher),
            new LogIn(repository, hasher, jwt),
            new PreRegisterUser(
                repository,
                hasher,
                new SecurePasswordGenerator(),
            ),
            new ResolveAuthenticatedUser(repository, jwt),
        );
        const app = buildApp({ auth });

        try {
            const firstAccess = await app.inject({
                method: 'POST',
                url: '/auth/first-access',
                payload: {
                    email: 'admin@admin.com',
                    temporaryPassword: 'TempPass123',
                    newPassword: 'NewPass123',
                },
            });
            expect(firstAccess.statusCode).toBe(204);

            const login = await app.inject({
                method: 'POST',
                url: '/auth/login',
                payload: { email: 'admin@admin.com', password: 'NewPass123' },
            });
            expect(login.statusCode).toBe(200);
            const token = login.json().token;
            expect(await jwt.verify(token)).toBe('admin@admin.com');

            const registered = await app.inject({
                method: 'POST',
                url: '/users',
                headers: { authorization: `Bearer ${token}` },
                payload: { email: 'person@example.com', role: 'ATENDENTE' },
            });
            expect(registered.statusCode).toBe(201);
            expect(registered.json().temporaryPassword).toEqual(
                expect.any(String),
            );
            expect(users.get('person@example.com')?.status).toBe(
                'PENDING_FIRST_ACCESS',
            );
        } finally {
            await app.close();
        }
    });
});

describe('buildApp error handling', () => {
    it('returns 409 when a customer still has linked vehicles', async () => {
        const app = buildApp();
        app.get('/customer-with-vehicles', async () => {
            throw new CustomerHasVehiclesError();
        });

        try {
            const response = await app.inject({
                method: 'GET',
                url: '/customer-with-vehicles',
            });

            expect(response.statusCode).toBe(409);
            expect(response.json()).toEqual({
                error: 'CustomerHasVehiclesError',
                message:
                    'Cannot delete customer while vehicles are linked to it.',
            });
        } finally {
            await app.close();
        }
    });

    it('preserves valid client-error status codes from Fastify errors', async () => {
        const app = buildApp();
        app.get('/client-error', async () => {
            throw Object.assign(new Error('Too many requests'), {
                statusCode: 429,
            });
        });

        try {
            const response = await app.inject({
                method: 'GET',
                url: '/client-error',
            });

            expect(response.statusCode).toBe(429);
            expect(response.json()).toEqual({
                error: 'InternalServerError',
                message: 'Internal server error.',
            });
        } finally {
            await app.close();
        }
    });

    it('returns 500 for errors without a valid client-error status', async () => {
        const app = buildApp();
        app.get('/server-error', async () => {
            throw Object.assign(new Error('Service unavailable'), {
                statusCode: 503,
            });
        });

        try {
            const response = await app.inject({
                method: 'GET',
                url: '/server-error',
            });

            expect(response.statusCode).toBe(500);
        } finally {
            await app.close();
        }
    });
});

describe('buildApp OpenAPI documentation', () => {
    it('includes Stock request and response examples', async () => {
        const execute = async (input: unknown) => input;
        const app = buildApp({
            stock: {
                registerPartSupply: { execute },
                registerStockEntry: { execute },
                reserveSupply: { execute },
                cancelReservation: { execute },
                writeOffStock: { execute },
            },
        } as never);

        try {
            await app.ready();
            const paths = app.swagger().paths;
            if (!paths) {
                throw new Error('OpenAPI paths were not generated');
            }
            const operation = JSON.parse(
                JSON.stringify(paths['/stock/parts']?.post),
            );
            const requestExample =
                operation.requestBody.content['application/json'].example;
            const responseExample =
                operation.responses['201'].content['application/json'].example;

            expect(requestExample).toMatchObject({
                partCode: 'PAST-FREIO-01',
                quantity: 10,
            });
            expect(responseExample).toMatchObject({
                partCode: 'PAST-FREIO-01',
                quantity: 10,
            });
        } finally {
            await app.close();
        }
    });
});
