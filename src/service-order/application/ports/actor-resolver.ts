import { AsyncLocalStorage } from 'node:async_hooks';

export type ApplicationPermission =
    'CLIENTE_EDITAR' | 'OS_CRIAR' | 'OS_CONCLUIR' | 'ESTOQUE_BAIXAR';

export type ServiceOrderPermission = Exclude<
    ApplicationPermission,
    'CLIENTE_EDITAR'
>;

export interface AuthenticatedActor {
    readonly id: string;
    can(permission: ApplicationPermission): boolean;
}

export interface ActorResolver {
    resolve(authorizationHeader?: string): Promise<string | null>;
    authenticate?(
        authorizationHeader?: string,
    ): Promise<AuthenticatedActor | null>;
}

export const actorContext = new AsyncLocalStorage<string | null>();
