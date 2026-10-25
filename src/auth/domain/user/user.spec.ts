import { describe, expect, it } from 'vitest';
import { Email } from '../../../shared/domain/email.js';
import { AccessPolicy, rolePermissions } from '../services/access-policy.js';
import { PermissionDenied } from '../exceptions/permission-denied.js';
import { UserWithoutPermission } from '../exceptions/user-without-permission.js';
import { User } from './user.js';
import {
    Password,
    InvalidPasswordException,
} from './value-objects/password.js';
import { Permission } from './value-objects/permission.js';
import { Role } from './value-objects/role.js';

describe('Auth domain', () => {
    it.each(['abcdefgh', 'ABC12345', '12345678'])(
        'accepts an alphanumeric password of at least eight characters: %s',
        (value) => {
            expect(Password.create(value).value).toBe(value);
        },
    );

    it.each([
        'short12',
        'abcdefgh!',
        '        ',
        'àbcdefgh',
        ' abcdefgh',
        42,
        null,
    ])('rejects invalid password input: %s', (value) => {
        expect(() => Password.create(value as string)).toThrow(
            InvalidPasswordException,
        );
    });

    it('rejects unknown roles and permissions', () => {
        expect(() => Role.create('UNKNOWN')).toThrow();
        expect(() => Permission.create('UNKNOWN')).toThrow();
    });

    it('keeps the configured role permissions immutable at runtime', () => {
        expect(Object.isFrozen(rolePermissions)).toBe(true);
        for (const permissions of Object.values(rolePermissions)) {
            expect(Object.isFrozen(permissions)).toBe(true);
        }
    });

    const policy = new AccessPolicy();
    const user = (
        role: string,
        status: 'ACTIVE' | 'PENDING_FIRST_ACCESS' | 'DEACTIVATED' = 'ACTIVE',
    ) =>
        new User(
            Email.create('person@example.com'),
            'stored-hash',
            Role.create(role),
            status,
        );

    it.each([
        ['ATENDENTE', 'OS_CRIAR', true],
        ['ATENDENTE', 'CLIENTE_EDITAR', true],
        ['ATENDENTE', 'OS_CONCLUIR', false],
        ['MECANICO', 'OS_CONCLUIR', true],
        ['MECANICO', 'ESTOQUE_BAIXAR', true],
        ['MECANICO', 'OS_CRIAR', false],
        ['ESTOQUISTA', 'ESTOQUE_BAIXAR', true],
        ['ESTOQUISTA', 'CLIENTE_EDITAR', false],
        ['GERENTE', 'OS_CRIAR', true],
        ['GERENTE', 'OS_CONCLUIR', true],
        ['GERENTE', 'ESTOQUE_BAIXAR', true],
        ['GERENTE', 'CLIENTE_EDITAR', true],
    ])('%s has permission %s: %s', (role, permission, allowed) => {
        expect(policy.can(user(role), Permission.create(permission))).toBe(
            allowed,
        );
    });

    it.each(['PENDING_FIRST_ACCESS', 'DEACTIVATED'] as const)(
        'denies %s users even when their role grants access',
        (status) => {
            const pending = user('GERENTE', status);
            expect(policy.can(pending, Permission.create('OS_CRIAR'))).toBe(
                false,
            );
            expect(() =>
                policy.require(pending, Permission.create('OS_CRIAR')),
            ).toThrow(PermissionDenied);
        },
    );

    it('distinguishes missing users from active users without a role permission', () => {
        expect(() =>
            policy.require(null, Permission.create('OS_CRIAR')),
        ).toThrow(PermissionDenied);
        expect(() =>
            policy.require(user('ATENDENTE'), Permission.create('OS_CONCLUIR')),
        ).toThrow(UserWithoutPermission);
    });

    it('activates only pending users with a replacement hash', () => {
        const pending = user('MECANICO', 'PENDING_FIRST_ACCESS');
        const activated = pending.activateWithPassword('new-stored-hash');
        expect(activated.password).toBe('new-stored-hash');
        expect(activated.status).toBe('ACTIVE');
        expect(pending.status).toBe('PENDING_FIRST_ACCESS');
        expect(() => activated.activateWithPassword('another-hash')).toThrow(
            PermissionDenied,
        );
        expect(() =>
            user('GERENTE', 'DEACTIVATED').activateWithPassword('another-hash'),
        ).toThrow(PermissionDenied);
    });
});
