import { describe, expect, it } from 'vitest';
import { TokenBiAccessGuard } from './token-bi-access-guard.js';

describe('TokenBiAccessGuard', () => {
    it('returns null when authorization header is missing or malformed', async () => {
        const guard = new TokenBiAccessGuard({
            verify: async () => ({ id: 'u-1', role: 'GERENTE' }),
        });

        expect(await guard.authenticate()).toBeNull();
        expect(await guard.authenticate('Basic abc')).toBeNull();
    });

    it('evaluates BI_VISUALIZAR against rolePermissions when using execute()-based verifier', async () => {
        const guard = new TokenBiAccessGuard({
            execute: async (token: string) => {
                if (token === 'inactive') {
                    return {
                        id: { value: 'u-inactive' },
                        status: 'INACTIVE',
                        role: { value: 'GERENTE' },
                    };
                }
                if (token === 'mechanic') {
                    return {
                        id: { value: 'u-mech' },
                        status: 'ACTIVE',
                        role: { value: 'MECANICO' },
                    };
                }
                if (token === 'manager') {
                    return {
                        id: { value: 'u-mgr' },
                        status: 'ACTIVE',
                        role: { value: 'GERENTE' },
                    };
                }
                throw new Error('invalid token');
            },
        });

        expect(await guard.authenticate('Bearer inactive')).toBeNull();
        expect(await guard.authenticate('Bearer unknown')).toBeNull();

        const mechanic = await guard.authenticate('Bearer mechanic');
        expect(mechanic?.id).toBe('u-mech');
        expect(mechanic?.can('BI_VISUALIZAR')).toBe(false);

        const manager = await guard.authenticate('Bearer manager');
        expect(manager?.id).toBe('u-mgr');
        expect(manager?.can('BI_VISUALIZAR')).toBe(true);
    });

    it('supports explicit permissions array in verify()-based verifier', async () => {
        const guard = new TokenBiAccessGuard({
            verify: async (token: string) =>
                token === 'custom'
                    ? { id: 'u-custom', permissions: ['BI_VISUALIZAR'] }
                    : { id: 'u-none' },
        });

        const custom = await guard.authenticate('Bearer custom');
        expect(custom?.can('BI_VISUALIZAR')).toBe(true);

        const none = await guard.authenticate('Bearer other');
        expect(none?.can('BI_VISUALIZAR')).toBe(false);
    });
});
