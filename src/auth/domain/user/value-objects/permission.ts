import { DomainException } from '../../../../shared/domain/domain-exception.js';

export class InvalidPermissionException extends DomainException {}

export class Permission {
    static readonly OS_CRIAR = 'OS_CRIAR';
    static readonly CLIENTE_EDITAR = 'CLIENTE_EDITAR';
    static readonly OS_CONCLUIR = 'OS_CONCLUIR';
    static readonly ESTOQUE_BAIXAR = 'ESTOQUE_BAIXAR';
    static readonly USUARIO_PRE_CADASTRAR = 'USUARIO_PRE_CADASTRAR';
    static readonly USUARIO_GERENCIAR = 'USUARIO_GERENCIAR';
    static readonly BI_VISUALIZAR = 'BI_VISUALIZAR';

    private constructor(public readonly value: PermissionValue) {
        Object.freeze(this);
    }

    static create(value: string): Permission {
        if (
            typeof value !== 'string' ||
            !Object.values(Permission).includes(value)
        ) {
            throw new InvalidPermissionException('Invalid permission');
        }
        return new Permission(value as PermissionValue);
    }
}

export type PermissionValue =
    | typeof Permission.OS_CRIAR
    | typeof Permission.CLIENTE_EDITAR
    | typeof Permission.OS_CONCLUIR
    | typeof Permission.ESTOQUE_BAIXAR
    | typeof Permission.USUARIO_PRE_CADASTRAR
    | typeof Permission.USUARIO_GERENCIAR
    | typeof Permission.BI_VISUALIZAR;
