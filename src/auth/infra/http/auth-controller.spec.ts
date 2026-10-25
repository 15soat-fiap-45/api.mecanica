import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { Email } from '../../../shared/domain/email.js';
import { FirstAccess } from '../../application/use-cases/first-access.js';
import { LogIn } from '../../application/use-cases/log-in.js';
import { PreRegisterUser } from '../../application/use-cases/pre-register-user.js';
import { ResolveAuthenticatedUser } from '../../application/use-cases/resolve-authenticated-user.js';
import { User } from '../../domain/user/user.js';
import type { UserRepository } from '../../domain/user/user-repository.js';
import { Role } from '../../domain/user/value-objects/role.js';
import { Argon2PasswordHasher } from '../security/argon2-password-hasher.js';
import { JoseTokenService } from '../security/jose-token-service.js';
import { AuthController } from './auth-controller.js';

function setup() {
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
    const app = Fastify();
    new AuthController(
        new FirstAccess(repository, hasher),
        new LogIn(repository, hasher, jwt),
        new PreRegisterUser(repository, hasher, {
            generate: () => 'TempPass123',
        }),
        new ResolveAuthenticatedUser(repository, jwt),
    ).register(app);
    return { app, users, hasher, jwt };
}

describe('AuthController', () => {
    it('requires the initial manager to reset the default password before login and registration', async () => {
        const { app, users, hasher } = setup();
        users.set(
            'admin@admin.com',
            new User(
                Email.create('admin@admin.com'),
                await hasher.hash('admin'),
                Role.create('GERENTE'),
                'PENDING_FIRST_ACCESS',
            ),
        );

        const before = await app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: { email: 'admin@admin.com', password: 'admin' },
        });
        expect(before.statusCode).toBe(403);
        expect(before.json()).not.toHaveProperty('token');

        const reset = await app.inject({
            method: 'POST',
            url: '/auth/first-access',
            payload: {
                email: 'admin@admin.com',
                temporaryPassword: 'admin',
                newPassword: 'NewPass123',
            },
        });
        expect(reset.statusCode).toBe(204);
        const old = await app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: { email: 'admin@admin.com', password: 'admin' },
        });
        expect(old.statusCode).toBe(401);
        const login = await app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: { email: 'admin@admin.com', password: 'NewPass123' },
        });
        expect(login.statusCode).toBe(200);
        expect(login.headers['cache-control']).toBe('no-store');
        const token = login.json().token;
        expect(typeof token).toBe('string');

        const created = await app.inject({
            method: 'POST',
            url: '/users',
            headers: { authorization: `Bearer ${token}` },
            payload: { email: 'person@example.com', role: 'ATENDENTE' },
        });
        expect(created.statusCode).toBe(201);
        expect(created.headers['cache-control']).toBe('no-store');
        expect(created.json()).toEqual({ temporaryPassword: 'TempPass123' });
        expect(users.get('person@example.com')?.status).toBe(
            'PENDING_FIRST_ACCESS',
        );
        expect(users.get('person@example.com')?.password).not.toBe(
            'TempPass123',
        );
        expect(
            (
                await app.inject({
                    method: 'POST',
                    url: '/auth/login',
                    payload: {
                        email: 'person@example.com',
                        password: 'TempPass123',
                    },
                })
            ).statusCode,
        ).toBe(403);
    });

    it('rejects unauthorized registration and invalid or reused first-access credentials', async () => {
        const { app, users, hasher, jwt } = setup();
        users.set(
            'staff@example.com',
            new User(
                Email.create('staff@example.com'),
                await hasher.hash('StaffPass123'),
                Role.create('ATENDENTE'),
                'ACTIVE',
            ),
        );
        const payload = { email: 'new@example.com', role: 'GERENTE' };
        expect(
            (await app.inject({ method: 'POST', url: '/users', payload }))
                .statusCode,
        ).toBe(401);
        expect(
            (
                await app.inject({
                    method: 'POST',
                    url: '/users',
                    headers: { authorization: 'Bearer forged' },
                    payload,
                })
            ).statusCode,
        ).toBe(403);
        expect(
            (
                await app.inject({
                    method: 'POST',
                    url: '/users',
                    headers: {
                        authorization: `Bearer ${await jwt.sign('staff@example.com')}`,
                    },
                    payload,
                })
            ).statusCode,
        ).toBe(403);
        expect(users.has('new@example.com')).toBe(false);
        expect(
            (
                await app.inject({
                    method: 'POST',
                    url: '/auth/first-access',
                    payload: {
                        email: 'staff@example.com',
                        temporaryPassword: 'wrong',
                        newPassword: 'NewPass123',
                    },
                })
            ).statusCode,
        ).toBe(401);
        expect(
            (
                await app.inject({
                    method: 'POST',
                    url: '/auth/first-access',
                    payload: {
                        email: 'staff@example.com',
                        temporaryPassword: 'StaffPass123',
                        newPassword: 'NewPass123',
                    },
                })
            ).statusCode,
        ).toBe(403);
        expect(
            (
                await app.inject({
                    method: 'POST',
                    url: '/auth/login',
                    payload: { email: 'staff@example.com' },
                })
            ).statusCode,
        ).toBe(400);
        expect(
            (
                await app.inject({
                    method: 'POST',
                    url: '/users',
                    headers: {
                        authorization: `Bearer ${await jwt.sign('staff@example.com')}`,
                    },
                    payload: { email: 'new@example.com' },
                })
            ).statusCode,
        ).toBe(400);
    });
});
