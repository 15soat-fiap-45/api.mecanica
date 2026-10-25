import { describe, expect, it } from 'vitest';
import { Email } from '../../../shared/domain/email.js';
import { PermissionDenied } from '../../domain/exceptions/permission-denied.js';
import { UserWithoutPermission } from '../../domain/exceptions/user-without-permission.js';
import { LastActiveManager } from '../../domain/exceptions/last-active-manager.js';
import { User } from '../../domain/user/user.js';
import type { UserManagementRepository } from '../../domain/user/user-repository.js';
import { Role } from '../../domain/user/value-objects/role.js';
import { UserNotFound } from '../exceptions/user-not-found.js';
import { ChangeUserRole } from './change-user-role.js';
import { DeactivateUser } from './deactivate-user.js';

describe('Manage users', () => {
    const users = new Map<string, User>();
    const countManagers = () =>
        [...users.values()].filter(
            (user) => user.status === 'ACTIVE' && user.role.value === 'GERENTE',
        ).length;
    const repository: UserManagementRepository = {
        findByEmail: async (email) => users.get(email.value) ?? null,
        save: async (user) => {
            users.set(user.email.value, user);
        },
        changeRoleAtomically: async (email, role) => {
            const user = users.get(email.value);
            if (!user) return null;
            if (
                user.status === 'ACTIVE' &&
                user.role.value === 'GERENTE' &&
                role.value !== 'GERENTE' &&
                countManagers() <= 1
            )
                throw new LastActiveManager();
            const changed = new User(
                user.email,
                user.password,
                role,
                user.status,
                user.id,
            );
            users.set(email.value, changed);
            return changed;
        },
        deactivateAtomically: async (email) => {
            const user = users.get(email.value);
            if (!user) return null;
            if (
                user.status === 'ACTIVE' &&
                user.role.value === 'GERENTE' &&
                countManagers() <= 1
            )
                throw new LastActiveManager();
            const changed = new User(
                user.email,
                user.password,
                user.role,
                'DEACTIVATED',
                user.id,
            );
            users.set(email.value, changed);
            return changed;
        },
    };
    const manager = new User(
        Email.create('manager@example.com'),
        'hash',
        Role.create('GERENTE'),
        'ACTIVE',
    );
    const attendant = new User(
        Email.create('staff@example.com'),
        'hash',
        Role.create('ATENDENTE'),
        'ACTIVE',
    );
    const seed = () => {
        users.clear();
        users.set(manager.email.value, manager);
        users.set(attendant.email.value, attendant);
    };

    it('allows an active manager to promote a user without changing their password or status', async () => {
        seed();
        const changed = await new ChangeUserRole(repository).execute(
            { email: ' STAFF@EXAMPLE.COM ', role: 'GERENTE' },
            manager,
        );
        expect(changed.role.value).toBe('GERENTE');
        expect(changed.password).toBe('hash');
        expect(changed.status).toBe('ACTIVE');
        expect(changed.id.equals(attendant.id)).toBe(true);
        expect(countManagers()).toBe(2);
    });

    it('prevents removing the last active manager by either demotion or deactivation', async () => {
        seed();
        await expect(
            new ChangeUserRole(repository).execute(
                { email: manager.email.value, role: 'MECANICO' },
                manager,
            ),
        ).rejects.toThrow(LastActiveManager);
        await expect(
            new DeactivateUser(repository).execute(
                { email: manager.email.value },
                manager,
            ),
        ).rejects.toThrow(LastActiveManager);
        expect(countManagers()).toBe(1);
    });

    it('allows deactivating or demoting a manager when another active manager remains', async () => {
        seed();
        await new ChangeUserRole(repository).execute(
            { email: attendant.email.value, role: 'GERENTE' },
            manager,
        );
        const demoted = await new ChangeUserRole(repository).execute(
            { email: manager.email.value, role: 'MECANICO' },
            manager,
        );
        expect(demoted.role.value).toBe('MECANICO');
        const deactivated = await new DeactivateUser(repository).execute(
            { email: manager.email.value },
            users.get(attendant.email.value)!,
        );
        expect(deactivated.status).toBe('DEACTIVATED');
        expect(deactivated.id.equals(manager.id)).toBe(true);
        expect(countManagers()).toBe(1);
    });

    it.each([
        null,
        attendant,
        new User(manager.email, manager.password, manager.role, 'DEACTIVATED'),
    ])(
        'denies management by anyone without an active manager permission',
        async (actor) => {
            seed();
            const error =
                actor === attendant ? UserWithoutPermission : PermissionDenied;
            await expect(
                new ChangeUserRole(repository).execute(
                    { email: attendant.email.value, role: 'GERENTE' },
                    actor,
                ),
            ).rejects.toThrow(error);
            await expect(
                new DeactivateUser(repository).execute(
                    { email: attendant.email.value },
                    actor,
                ),
            ).rejects.toThrow(error);
            expect(users.get(attendant.email.value)?.status).toBe('ACTIVE');
        },
    );

    it('rejects unknown targets without changing any user', async () => {
        seed();
        await expect(
            new ChangeUserRole(repository).execute(
                { email: 'missing@example.com', role: 'GERENTE' },
                manager,
            ),
        ).rejects.toThrow(UserNotFound);
        await expect(
            new DeactivateUser(repository).execute(
                { email: 'missing@example.com' },
                manager,
            ),
        ).rejects.toThrow(UserNotFound);
        expect(users.size).toBe(2);
    });
});
