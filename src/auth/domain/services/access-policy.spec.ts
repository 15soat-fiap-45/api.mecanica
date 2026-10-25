import { describe, expect, it } from 'vitest';
import { Email } from '../../../shared/domain/email.js';
import { PermissionDenied } from '../exceptions/permission-denied.js';
import { UserWithoutPermission } from '../exceptions/user-without-permission.js';
import { User, type UserStatus } from '../user/user.js';
import { Permission } from '../user/value-objects/permission.js';
import { Role } from '../user/value-objects/role.js';
import { AccessPolicy, rolePermissions } from './access-policy.js';

describe('AccessPolicy', () => {
    const policy = new AccessPolicy();
    const user = (role: string, status: UserStatus = 'ACTIVE') =>
        new User(
            Email.create('person@example.com'),
            'stored-hash',
            Role.create(role),
            status,
        );
    const permissions = [
        'OS_CRIAR',
        'CLIENTE_EDITAR',
        'OS_CONCLUIR',
        'ESTOQUE_BAIXAR',
        'USUARIO_PRE_CADASTRAR',
        'USUARIO_GERENCIAR',
    ];

    it.each([
        ['ATENDENTE', ['OS_CRIAR', 'CLIENTE_EDITAR']],
        ['MECANICO', ['OS_CONCLUIR', 'ESTOQUE_BAIXAR']],
        ['ESTOQUISTA', ['ESTOQUE_BAIXAR']],
        ['GERENTE', permissions],
    ])('%s grants exactly its configured permissions', (role, granted) => {
        for (const permission of permissions) {
            expect(policy.can(user(role), Permission.create(permission))).toBe(
                granted.includes(permission),
            );
        }
    });

    it.each(['PENDING_FIRST_ACCESS', 'DEACTIVATED'] as const)(
        'denies every permission for a %s manager',
        (status) => {
            for (const permission of permissions) {
                const requested = Permission.create(permission);
                expect(policy.can(user('GERENTE', status), requested)).toBe(
                    false,
                );
                expect(() =>
                    policy.require(user('GERENTE', status), requested),
                ).toThrow(PermissionDenied);
            }
        },
    );

    it('distinguishes missing users from active users without a permission', () => {
        const requested = Permission.create('USUARIO_GERENCIAR');
        expect(() => policy.require(null, requested)).toThrow(PermissionDenied);
        expect(() => policy.require(user('ATENDENTE'), requested)).toThrow(
            UserWithoutPermission,
        );
    });

    it('keeps role permission rules immutable', () => {
        expect(Object.isFrozen(rolePermissions)).toBe(true);
        for (const grants of Object.values(rolePermissions)) {
            expect(Object.isFrozen(grants)).toBe(true);
        }
    });

    it('rejects unknown roles and permissions', () => {
        expect(() => Role.create('UNKNOWN')).toThrow();
        expect(() => Permission.create('UNKNOWN')).toThrow();
    });
});
