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

    it('resolves the user id and enforces role permissions using a ResolveAuthenticatedUser-compatible use case', async () => {
        const usersByToken = {
            'jwt-atendente': {
                id: { value: 'user-atendente' },
                status: 'ACTIVE',
                role: { value: 'ATENDENTE' as const },
            },
            'jwt-mecanico': {
                id: { value: 'user-mecanico' },
                status: 'ACTIVE',
                role: { value: 'MECANICO' as const },
            },
            'jwt-estoquista': {
                id: { value: 'user-estoquista' },
                status: 'ACTIVE',
                role: { value: 'ESTOQUISTA' as const },
            },
            'jwt-gerente': {
                id: { value: 'user-gerente' },
                status: 'ACTIVE',
                role: { value: 'GERENTE' as const },
            },
            'jwt-inactive': {
                id: { value: 'user-inactive' },
                status: 'INACTIVE',
                role: { value: 'GERENTE' as const },
            },
        };
        const useCase = {
            execute: vi.fn(async (token: string) => {
                const user =
                    usersByToken[token as keyof typeof usersByToken] ?? null;
                if (!user) throw new Error('PermissionDenied');
                return user;
            }),
        };
        const resolver = new TokenActorResolver(useCase);

        const atendente = await resolver.authenticate('Bearer jwt-atendente');
        expect(atendente?.id).toBe('user-atendente');
        expect(atendente?.can('OS_CRIAR')).toBe(true);
        expect(atendente?.can('OS_CONCLUIR')).toBe(false);
        expect(atendente?.can('ESTOQUE_BAIXAR')).toBe(false);

        const mecanico = await resolver.authenticate('Bearer jwt-mecanico');
        expect(mecanico?.id).toBe('user-mecanico');
        expect(mecanico?.can('OS_CRIAR')).toBe(false);
        expect(mecanico?.can('OS_CONCLUIR')).toBe(true);
        expect(mecanico?.can('ESTOQUE_BAIXAR')).toBe(true);

        const estoquista = await resolver.authenticate('Bearer jwt-estoquista');
        expect(estoquista?.id).toBe('user-estoquista');
        expect(estoquista?.can('OS_CRIAR')).toBe(false);
        expect(estoquista?.can('OS_CONCLUIR')).toBe(false);
        expect(estoquista?.can('ESTOQUE_BAIXAR')).toBe(true);

        const gerente = await resolver.authenticate('Bearer jwt-gerente');
        expect(gerente?.id).toBe('user-gerente');
        expect(gerente?.can('OS_CRIAR')).toBe(true);
        expect(gerente?.can('OS_CONCLUIR')).toBe(true);
        expect(gerente?.can('ESTOQUE_BAIXAR')).toBe(true);

        expect(await resolver.authenticate('Bearer jwt-inactive')).toBeNull();
        expect(await resolver.resolve('Bearer expired')).toBeNull();
    });
});
