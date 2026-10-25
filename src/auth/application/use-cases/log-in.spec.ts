import { describe, expect, it, vi } from 'vitest';
import { Email } from '../../../shared/domain/email.js';
import { PermissionDenied } from '../../domain/exceptions/permission-denied.js';
import type { TokenService } from '../token-service.js';
import type { PasswordHasher } from '../../domain/services/password-hasher.js';
import type { UserRepository } from '../../domain/user/user-repository.js';
import { User, type UserStatus } from '../../domain/user/user.js';
import { Role } from '../../domain/user/value-objects/role.js';
import { FirstAccessRequired } from '../exceptions/first-access-required.js';
import { InvalidCredentials } from '../exceptions/invalid-credentials.js';
import { LogIn } from './log-in.js';

describe('LogIn', () => {
    const users = new Map<string, User>();
    const repository: UserRepository = {
        save: async (user) => {
            users.set(user.email.value, user);
        },
        findByEmail: async (email) => users.get(email.value) ?? null,
    };
    const hasher: PasswordHasher = {
        hash: async (password) => `hashed:${password}`,
        verify: async (password, hash) => hash === `hashed:${password}`,
    };
    const jwt: TokenService = {
        sign: async (email) => `signed:${email}`,
        verify: async (token) =>
            token.startsWith('signed:') ? token.slice(7) : null,
    };
    const logIn = new LogIn(repository, hasher, jwt);
    const saveUser = async (status: UserStatus) =>
        repository.save(
            new User(
                Email.create('person@example.com'),
                'hashed:Correct123',
                Role.create('GERENTE'),
                status,
            ),
        );

    it('issues an email-only token for an active user with valid credentials', async () => {
        users.clear();
        await saveUser('ACTIVE');
        expect(
            await logIn.execute({
                email: ' PERSON@EXAMPLE.COM ',
                password: 'Correct123',
            }),
        ).toBe('signed:person@example.com');
    });

    it.each([
        ['missing@example.com', 'Correct123'],
        ['person@example.com', 'Incorrect123'],
        ['not-an-email', 'Correct123'],
    ])(
        'rejects incorrect credentials without revealing which field failed',
        async (email, password) => {
            users.clear();
            await saveUser('ACTIVE');
            await expect(logIn.execute({ email, password })).rejects.toThrow(
                InvalidCredentials,
            );
        },
    );

    it('verifies a password even when the email does not exist', async () => {
        const verify = vi.fn(hasher.verify);
        const login = new LogIn(repository, { ...hasher, verify }, jwt);
        users.clear();
        await expect(
            login.execute({
                email: 'missing@example.com',
                password: 'Incorrect123',
            }),
        ).rejects.toThrow(InvalidCredentials);
        expect(verify).toHaveBeenCalledOnce();
    });

    it('retries dummy hash generation after a rejection', async () => {
        const hashError = new Error('hash unavailable');
        const hash = vi
            .fn<PasswordHasher['hash']>()
            .mockRejectedValueOnce(hashError)
            .mockResolvedValueOnce('hashed:NotARealAccountPassword');
        const login = new LogIn(repository, { ...hasher, hash }, jwt);
        users.clear();

        await expect(
            login.execute({
                email: 'missing@example.com',
                password: 'Incorrect123',
            }),
        ).rejects.toBe(hashError);
        await expect(
            login.execute({
                email: 'missing@example.com',
                password: 'Incorrect123',
            }),
        ).rejects.toThrow(InvalidCredentials);
        expect(hash).toHaveBeenCalledTimes(2);
    });

    it('requires first access when a pending user supplies the temporary password', async () => {
        users.clear();
        await saveUser('PENDING_FIRST_ACCESS');
        await expect(
            logIn.execute({
                email: 'person@example.com',
                password: 'Correct123',
            }),
        ).rejects.toThrow(FirstAccessRequired);
        await expect(
            logIn.execute({
                email: 'person@example.com',
                password: 'Incorrect123',
            }),
        ).rejects.toThrow(InvalidCredentials);
    });

    it('denies deactivated users after verifying their credentials', async () => {
        users.clear();
        await saveUser('DEACTIVATED');
        await expect(
            logIn.execute({
                email: 'person@example.com',
                password: 'Correct123',
            }),
        ).rejects.toThrow(PermissionDenied);
        await expect(
            logIn.execute({
                email: 'person@example.com',
                password: 'Incorrect123',
            }),
        ).rejects.toThrow(InvalidCredentials);
    });
});
