import { rolePermissions } from '../auth/domain/services/access-policy.js';
import type { RoleValue } from '../auth/domain/user/value-objects/role.js';
import type {
    BiAccessGuard,
    BiAuthenticatedActor,
    BiPermission,
} from '../business-intelligence/application/ports/bi-access-guard.js';

export type BiTokenVerificationResult =
    | {
          id: string;
          role?: RoleValue | undefined;
          permissions?: readonly BiPermission[] | undefined;
      }
    | null;

export type BiTokenVerifier =
    | { verify(token: string): Promise<BiTokenVerificationResult> }
    | {
          execute(token: string): Promise<{
              id: { value: string };
              status?: string | undefined;
              role?: { value: RoleValue } | undefined;
          }>;
      };

export class TokenBiAccessGuard implements BiAccessGuard {
    constructor(private readonly verifier: BiTokenVerifier) {}

    async authenticate(
        authorizationHeader?: string,
    ): Promise<BiAuthenticatedActor | null> {
        const match = /^Bearer (\S+)$/i.exec(authorizationHeader?.trim() ?? '');
        if (!match?.[1]) return null;
        try {
            if ('verify' in this.verifier) {
                const result = await this.verifier.verify(match[1]);
                if (!result) return null;
                const allowed =
                    result.permissions ??
                    (result.role ? rolePermissions[result.role] : undefined);
                return {
                    id: result.id,
                    can: (permission) =>
                        allowed ? allowed.includes(permission) : false,
                };
            }
            const user = await this.verifier.execute(match[1]);
            if (user.status && user.status !== 'ACTIVE') return null;
            const role = user.role?.value;
            return {
                id: user.id.value,
                can: (permission) =>
                    role ? rolePermissions[role].includes(permission) : false,
            };
        } catch {
            return null;
        }
    }
}
