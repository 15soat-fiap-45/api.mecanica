import { describe, expect, it, vi } from 'vitest';
import { TokenActorResolver } from './token-actor-resolver.js';

describe('TokenActorResolver', () => {
    it('resolves the subject using a JoseTokenService-compatible verifier', async () => {
        const verifier = {
            verify: vi.fn(async (token: string) =>
                token === 'valid-jwt' ? 'mecanico@oficina.com' : null,
            ),
        };
        const resolver = new TokenActorResolver(verifier);

        expect(await resolver.resolve('Bearer valid-jwt')).toBe(
            'mecanico@oficina.com',
        );
        expect(await resolver.resolve('Bearer invalid')).toBeNull();
        expect(await resolver.resolve(undefined)).toBeNull();
    });

    it('resolves the user id using a ResolveAuthenticatedUser-compatible use case', async () => {
        const useCase = {
            execute: vi.fn(async (token: string) => {
                if (token !== 'valid-jwt') throw new Error('PermissionDenied');
                return {
                    id: { value: '550e8400-e29b-41d4-a716-446655440000' },
                };
            }),
        };
        const resolver = new TokenActorResolver(useCase);

        expect(await resolver.resolve('Bearer valid-jwt')).toBe(
            '550e8400-e29b-41d4-a716-446655440000',
        );
        expect(await resolver.resolve('Bearer expired')).toBeNull();
    });
});
