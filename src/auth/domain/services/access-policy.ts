import { PermissionDenied } from '../exceptions/permission-denied.js';
import { UserWithoutPermission } from '../exceptions/user-without-permission.js';
import type { User } from '../user/user.js';
import {
    Permission,
    type PermissionValue,
} from '../user/value-objects/permission.js';
import type { RoleValue } from '../user/value-objects/role.js';

export const rolePermissions: Readonly<
    Record<RoleValue, readonly PermissionValue[]>
> = Object.freeze({
    ATENDENTE: Object.freeze([
        Permission.OS_CRIAR,
        Permission.CLIENTE_EDITAR,
    ] as const),
    MECANICO: Object.freeze([
        Permission.OS_CONCLUIR,
        Permission.ESTOQUE_BAIXAR,
    ] as const),
    ESTOQUISTA: Object.freeze([Permission.ESTOQUE_BAIXAR] as const),
    GERENTE: Object.freeze(Object.values(Permission)),
});

export class AccessPolicy {
    can(user: User | null, permission: Permission): boolean {
        return (
            !!user &&
            user.status === 'ACTIVE' &&
            rolePermissions[user.role.value].includes(permission.value)
        );
    }

    require(user: User | null, permission: Permission): void {
        if (!user || user.status !== 'ACTIVE') throw new PermissionDenied();
        if (!this.can(user, permission)) throw new UserWithoutPermission();
    }
}
