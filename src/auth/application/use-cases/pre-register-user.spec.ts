import { describe, expect, it } from 'vitest';
import { Email } from '../../../shared/domain/email.js';
import { InvalidPasswordException } from '../../domain/user/value-objects/password.js';
import { PermissionDenied } from '../../domain/exceptions/permission-denied.js';
import type { PasswordHasher } from '../../domain/services/password-hasher.js';
import type { PasswordGenerator } from '../../domain/services/password-generator.js';
import { User } from '../../domain/user/user.js';
import type { UserRepository } from '../../domain/user/user-repository.js';
import { Role } from '../../domain/user/value-objects/role.js';
import { UserAlreadyExistsError } from '../exceptions/user-already-exists.js';
import { PreRegisterUser } from './pre-register-user.js';

describe('PreRegisterUser', () => {
    const manager = new User(
        Email.create('manager@example.com'),
        'stored-hash',
        Role.create('GERENTE'),
        'ACTIVE',
    );
    const users = new Map<string, User>();
    const repository: UserRepository = {
        findByEmail: async (email) => users.get(email.value) ?? null,
        save: async (user) => {
            users.set(user.email.value, user);
        },
    };
    const hasher: PasswordHasher = {
        hash: async (password) => `hashed:${password}`,
        verify: async (password, hash) => hash === `hashed:${password}`,
    };
    const generator: PasswordGenerator = { generate: () => 'TempPass123' };

    it('saves the generated password hash without retaining plaintext in User', async () => {
        users.clear();
        const temporaryPassword = await new PreRegisterUser(
            repository,
            hasher,
            generator,
        ).execute({ email: ' NEW@EXAMPLE.COM ', role: 'ATENDENTE' }, manager);
        const stored = users.get('new@example.com');
        expect(temporaryPassword).toBe('TempPass123');
        expect(stored?.password).toBe('hashed:TempPass123');
        expect(stored?.status).toBe('PENDING_FIRST_ACCESS');
        expect(stored?.role.value).toBe('ATENDENTE');
    });

    it('rejects an invalid generated password without saving the user', async () => {
        users.clear();
        await expect(
            new PreRegisterUser(repository, hasher, {
                generate: () => 'short',
            }).execute(
                { email: 'new@example.com', role: 'ATENDENTE' },
                manager,
            ),
        ).rejects.toThrow(InvalidPasswordException);
        expect(users.size).toBe(0);
    });

    it('rejects unauthorized callers and duplicate emails', async () => {
        users.clear();
        await expect(
            new PreRegisterUser(repository, hasher, generator).execute(
                { email: 'new@example.com', role: 'ATENDENTE' },
                null,
            ),
        ).rejects.toThrow(PermissionDenied);
        await new PreRegisterUser(repository, hasher, generator).execute(
            { email: 'new@example.com', role: 'ATENDENTE' },
            manager,
        );
        await expect(
            new PreRegisterUser(repository, hasher, generator).execute(
                { email: 'new@example.com', role: 'MECANICO' },
                manager,
            ),
        ).rejects.toThrow(UserAlreadyExistsError);
        expect(users.size).toBe(1);
    });
});
