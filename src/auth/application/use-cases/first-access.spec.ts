import { describe, expect, it } from 'vitest';
import { Email } from '../../../shared/domain/email.js';
import { PermissionDenied } from '../../domain/exceptions/permission-denied.js';
import { UserWithoutPermission } from '../../domain/exceptions/user-without-permission.js';
import { FirstAccessNotAllowed } from '../exceptions/first-access-not-allowed.js';
import { InvalidCredentials } from '../exceptions/invalid-credentials.js';
import { PasswordReuse } from '../exceptions/password-reuse.js';
import { UserAlreadyExistsError } from '../exceptions/user-already-exists.js';
import type { PasswordHasher } from '../../domain/services/password-hasher.js';
import { User } from '../../domain/user/user.js';
import type { UserRepository } from '../../domain/user/user-repository.js';
import { Role } from '../../domain/user/value-objects/role.js';
import { InvalidPasswordException } from '../../domain/user/value-objects/password.js';
import { FirstAccess } from './first-access.js';
import { PreRegisterUser } from './pre-register-user.js';

describe('First access', () => {
    const hasher: PasswordHasher = {
        hash: async (value) => `hashed:${value}`,
        verify: async (value, hash) => hash === `hashed:${value}`,
    };
    const generator = { generate: () => 'TempPass123' };
    const users = new Map<string, User>();
    const repository: UserRepository = {
        findByEmail: async (email) => users.get(email.value) ?? null,
        save: async (user) => {
            users.set(user.email.value, user);
        },
    };
    const manager = new User(
        Email.create('manager@example.com'),
        'manager-hash',
        Role.create('GERENTE'),
        'ACTIVE',
    );

    it.each([
        [null, PermissionDenied],
        [
            new User(
                manager.email,
                manager.password,
                manager.role,
                'PENDING_FIRST_ACCESS',
            ),
            PermissionDenied,
        ],
        [
            new User(
                manager.email,
                manager.password,
                manager.role,
                'DEACTIVATED',
            ),
            PermissionDenied,
        ],
        [
            new User(
                Email.create('attendant@example.com'),
                'attendant-hash',
                Role.create('ATENDENTE'),
                'ACTIVE',
            ),
            UserWithoutPermission,
        ],
        [
            new User(
                Email.create('mechanic@example.com'),
                'mechanic-hash',
                Role.create('MECANICO'),
                'ACTIVE',
            ),
            UserWithoutPermission,
        ],
        [
            new User(
                Email.create('stock@example.com'),
                'stock-hash',
                Role.create('ESTOQUISTA'),
                'ACTIVE',
            ),
            UserWithoutPermission,
        ],
    ] as const)(
        'denies pre-registration by a user who is not an active manager',
        async (actor, error) => {
            users.clear();
            await expect(
                new PreRegisterUser(repository, hasher, generator).execute(
                    { email: 'new@example.com', role: 'MECANICO' },
                    actor,
                ),
            ).rejects.toThrow(error);
            expect(users.size).toBe(0);
        },
    );

    it('pre-registers with a random temporary password and stores only its hash', async () => {
        users.clear();
        const temporaryPassword = await new PreRegisterUser(
            repository,
            hasher,
            generator,
        ).execute(
            {
                email: '  PERSON@EXAMPLE.COM ',
                role: 'MECANICO',
            },
            manager,
        );
        const saved = await repository.findByEmail(
            Email.create('person@example.com'),
        );
        expect(temporaryPassword).toMatch(/^[a-zA-Z0-9]{8,}$/);
        expect(saved?.status).toBe('PENDING_FIRST_ACCESS');
        expect(saved?.password).not.toBe(temporaryPassword);
        expect(await hasher.verify(temporaryPassword, saved!.password)).toBe(
            true,
        );
        await expect(
            new PreRegisterUser(repository, hasher, generator).execute(
                {
                    email: 'person@example.com',
                    role: 'GERENTE',
                },
                manager,
            ),
        ).rejects.toThrow(UserAlreadyExistsError);
        expect(saved?.role.value).toBe('MECANICO');
    });

    it('verifies temporary password before replacing hash and activating', async () => {
        users.clear();
        const temporaryPassword = await new PreRegisterUser(
            repository,
            hasher,
            generator,
        ).execute(
            {
                email: 'person@example.com',
                role: 'ATENDENTE',
            },
            manager,
        );
        const reset = new FirstAccess(repository, hasher);
        await reset.execute({
            email: 'person@example.com',
            temporaryPassword,
            newPassword: 'NewPass123',
        });
        const saved = await repository.findByEmail(
            Email.create('person@example.com'),
        );
        expect(saved?.status).toBe('ACTIVE');
        expect(saved?.password).toBe('hashed:NewPass123');
        await expect(
            reset.execute({
                email: 'person@example.com',
                temporaryPassword,
                newPassword: 'OtherPass123',
            }),
        ).rejects.toThrow(InvalidCredentials);
        await expect(
            reset.execute({
                email: 'person@example.com',
                temporaryPassword: 'NewPass123',
                newPassword: 'OtherPass123',
            }),
        ).rejects.toThrow(FirstAccessNotAllowed);
    });

    it('does not change state for wrong credentials, invalid new password or deactivated users', async () => {
        users.clear();
        const user = new User(
            Email.create('person@example.com'),
            'hashed:TempPass123',
            Role.create('GERENTE'),
            'PENDING_FIRST_ACCESS',
        );
        await repository.save(user);
        const reset = new FirstAccess(repository, hasher);
        await expect(
            reset.execute({
                email: 'person@example.com',
                temporaryPassword: 'WrongPass123',
                newPassword: 'NewPass123',
            }),
        ).rejects.toThrow(InvalidCredentials);
        await expect(
            reset.execute({
                email: 'person@example.com',
                temporaryPassword: 'TempPass123',
                newPassword: 'weak',
            }),
        ).rejects.toThrow(InvalidPasswordException);
        expect(user.status).toBe('PENDING_FIRST_ACCESS');
        expect(user.password).toBe('hashed:TempPass123');
        const deactivated = new User(
            user.email,
            user.password,
            user.role,
            'DEACTIVATED',
        );
        await repository.save(deactivated);
        await expect(
            reset.execute({
                email: 'person@example.com',
                temporaryPassword: 'TempPass123',
                newPassword: 'NewPass123',
            }),
        ).rejects.toThrow(FirstAccessNotAllowed);
        await expect(
            reset.execute({
                email: 'missing@example.com',
                temporaryPassword: 'TempPass123',
                newPassword: 'NewPass123',
            }),
        ).rejects.toThrow(InvalidCredentials);
    });

    it('does not activate the loaded user if persistence fails', async () => {
        const user = new User(
            Email.create('person@example.com'),
            'hashed:TempPass123',
            Role.create('ATENDENTE'),
            'PENDING_FIRST_ACCESS',
        );
        const failingRepository: UserRepository = {
            findByEmail: async () => user,
            save: async () => {
                throw new Error('storage unavailable');
            },
        };
        await expect(
            new FirstAccess(failingRepository, hasher).execute({
                email: 'person@example.com',
                temporaryPassword: 'TempPass123',
                newPassword: 'NewPass123',
            }),
        ).rejects.toThrow('storage unavailable');
        expect(user.status).toBe('PENDING_FIRST_ACCESS');
        expect(user.password).toBe('hashed:TempPass123');
    });

    it('requires the first password to differ from the temporary one', async () => {
        const user = new User(
            Email.create('person@example.com'),
            'hashed:TempPass123',
            Role.create('ATENDENTE'),
            'PENDING_FIRST_ACCESS',
        );
        const reset = new FirstAccess(
            {
                findByEmail: async () => user,
                save: async () => {
                    throw new Error('must not save');
                },
            },
            hasher,
        );
        await expect(
            reset.execute({
                email: 'person@example.com',
                temporaryPassword: 'TempPass123',
                newPassword: 'TempPass123',
            }),
        ).rejects.toThrow(PasswordReuse);
        expect(user.status).toBe('PENDING_FIRST_ACCESS');
    });
});
