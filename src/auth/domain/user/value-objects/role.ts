import { DomainException } from '../../../../shared/domain/domain-exception.js';

export class InvalidRoleException extends DomainException {}

export const ROLES = [
    'ATENDENTE',
    'MECANICO',
    'ESTOQUISTA',
    'GERENTE',
] as const;
export type RoleValue = (typeof ROLES)[number];

export class Role {
    private constructor(public readonly value: RoleValue) {
        Object.freeze(this);
    }

    static create(value: string): Role {
        if (typeof value !== 'string' || !ROLES.includes(value as RoleValue)) {
            throw new InvalidRoleException('Invalid role');
        }
        return new Role(value as RoleValue);
    }
}
