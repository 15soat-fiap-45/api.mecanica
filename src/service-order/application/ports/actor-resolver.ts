import { AsyncLocalStorage } from 'node:async_hooks';

export type ServiceOrderPermission =
    'OS_CRIAR' | 'OS_CONCLUIR' | 'ESTOQUE_BAIXAR';

export interface AuthenticatedActor {
    readonly id: string;
    can(permission: ServiceOrderPermission): boolean;
}

export interface ActorResolver {
    resolve(authorizationHeader?: string): Promise<string | null>;
    authenticate?(
        authorizationHeader?: string,
    ): Promise<AuthenticatedActor | null>;
}

export const actorContext = new AsyncLocalStorage<string | null>();
