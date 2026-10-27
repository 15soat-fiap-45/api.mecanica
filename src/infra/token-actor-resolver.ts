import type { ActorResolver } from '../service-order/application/ports/actor-resolver.js';

export type TokenVerifier =
    | { verify(token: string): Promise<string | null> }
    | { execute(token: string): Promise<{ id: { value: string } }> };

export class TokenActorResolver implements ActorResolver {
    constructor(private readonly verifier: TokenVerifier) {}

    async resolve(authorizationHeader?: string): Promise<string | null> {
        const match = /^Bearer (\S+)$/i.exec(authorizationHeader?.trim() ?? '');
        if (!match?.[1]) return null;
        try {
            if ('verify' in this.verifier) {
                return await this.verifier.verify(match[1]);
            }
            const user = await this.verifier.execute(match[1]);
            return user.id.value;
        } catch {
            return null;
        }
    }
}
