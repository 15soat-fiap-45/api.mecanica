import { describe, expect, it } from 'vitest';
import { Email } from '../../../shared/domain/email.js';
import { PermissionDenied } from '../../domain/exceptions/permission-denied.js';
import type { TokenService } from '../token-service.js';
import type { UserRepository } from '../../domain/user/user-repository.js';
import { User, type UserStatus } from '../../domain/user/user.js';
import { Role } from '../../domain/user/value-objects/role.js';
import { ResolveAuthenticatedUser } from './resolve-authenticated-user.js';

describe('ResolveAuthenticatedUser', () => {
    const users = new Map<string, User>();
    const repository: UserRepository = {
        save: async (user) => {
            users.set(user.email.value, user);
        },
        findByEmail: async (email) => users.get(email.value) ?? null,
    };
    const jwt: TokenService = {
        sign: async (email) => `signed:${email}`,
        verify: async (token) =>
            token.startsWith('signed:') ? token.slice(7) : null,
    };
    const resolve = new ResolveAuthenticatedUser(repository, jwt);
    const saveUser = async (status: UserStatus) =>
        repository.save(
            new User(
                Email.create('person@example.com'),
                'stored-hash',
                Role.create('ATENDENTE'),
                status,
            ),
        );

    it('reloads an active user from the email in the verified token', async () => {
        users.clear();
        await saveUser('ACTIVE');
        const user = await resolve.execute('signed:person@example.com');
        expect(user.email.value).toBe('person@example.com');
        expect(user.status).toBe('ACTIVE');
    });

    it.each([
        '',
        'forged',
        'signed:not-an-email',
        'signed:missing@example.com',
    ])(
        'rejects invalid tokens and tokens for missing users: %s',
        async (token) => {
            users.clear();
            await expect(resolve.execute(token)).rejects.toThrow(
                PermissionDenied,
            );
        },
    );

    it.each(['PENDING_FIRST_ACCESS', 'DEACTIVATED'] as const)(
        'denies %s users even with a valid token',
        async (status) => {
            users.clear();
            await saveUser(status);
            await expect(
                resolve.execute('signed:person@example.com'),
            ).rejects.toThrow(PermissionDenied);
        },
    );

    it('rejects a token after its user has been deactivated', async () => {
        users.clear();
        await saveUser('ACTIVE');
        const token = await jwt.sign('person@example.com');
        expect((await resolve.execute(token)).status).toBe('ACTIVE');
        await saveUser('DEACTIVATED');
        await expect(resolve.execute(token)).rejects.toThrow(PermissionDenied);
    });
});
