import { AsyncLocalStorage } from 'node:async_hooks';

export interface ActorResolver {
    resolve(authorizationHeader?: string): Promise<string | null>;
}

export const actorContext = new AsyncLocalStorage<string | null>();
