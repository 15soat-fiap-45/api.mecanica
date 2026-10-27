import { rolePermissions } from '../auth/domain/services/access-policy.js';
import type { RoleValue } from '../auth/domain/user/value-objects/role.js';
import type {
    ActorResolver,
    AuthenticatedActor,
    ServiceOrderPermission,
} from '../service-order/application/ports/actor-resolver.js';

export type VerifiedTokenResult =
    | string
    | {
          id: string;
          role?: RoleValue;
          permissions?: readonly ServiceOrderPermission[];
      }
    | null;

export type TokenVerifier =
    | { verify(token: string): Promise<VerifiedTokenResult> }
    | {
          execute(token: string): Promise<{
              id: { value: string };
              status?: string;
              role?: { value: RoleValue };
          }>;
      };

export class TokenActorResolver implements ActorResolver {
    constructor(private readonly verifier: TokenVerifier) {}

    async authenticate(
        authorizationHeader?: string,
    ): Promise<AuthenticatedActor | null> {
        const match = /^Bearer (\S+)$/i.exec(authorizationHeader?.trim() ?? '');
        if (!match?.[1]) return null;
        try {
            if ('verify' in this.verifier) {
                const result = await this.verifier.verify(match[1]);
                if (!result) return null;
                if (typeof result === 'string') {
                    return { id: result, can: () => true };
                }
                const allowed =
                    result.permissions ??
                    (result.role ? rolePermissions[result.role] : undefined);
                return {
                    id: result.id,
                    can: (permission) =>
                        allowed ? allowed.includes(permission) : true,
                };
            }
            const user = await this.verifier.execute(match[1]);
            if (user.status && user.status !== 'ACTIVE') return null;
            const role = user.role?.value;
            return {
                id: user.id.value,
                can: (permission) =>
                    role ? rolePermissions[role].includes(permission) : true,
            };
        } catch {
            return null;
        }
    }

    async resolve(authorizationHeader?: string): Promise<string | null> {
        const actor = await this.authenticate(authorizationHeader);
        return actor?.id ?? null;
    }
}
