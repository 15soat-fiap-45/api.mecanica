import { decodeJwt } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JoseTokenService } from './jose-token-service.js';

describe('JoseTokenService', () => {
    const secret = 'a-secure-signing-key-with-32-bytes-minimum';
    afterEach(() => vi.useRealTimers());

    it('signs an email-only token valid for exactly four hours', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
        const service = new JoseTokenService(secret);
        const token = await service.sign('person@example.com');
        const payload = decodeJwt(token);

        expect(payload.sub).toBe('person@example.com');
        expect(payload.exp! - payload.iat!).toBe(4 * 60 * 60);
        expect(payload).not.toHaveProperty('role');
        expect(payload).not.toHaveProperty('status');
        expect(payload).not.toHaveProperty('password');
        expect(await service.verify(token)).toBe('person@example.com');

        vi.setSystemTime(new Date('2026-01-01T16:00:01Z'));
        expect(await service.verify(token)).toBeNull();
    });

    it('rejects tampered, malformed, and differently signed tokens', async () => {
        const service = new JoseTokenService(secret);
        const token = await service.sign('person@example.com');
        expect(await service.verify(`${token}tampered`)).toBeNull();
        expect(await service.verify('not-a-jwt')).toBeNull();
        expect(
            await new JoseTokenService(
                'another-secure-signing-key-with-32-bytes',
            ).verify(token),
        ).toBeNull();
    });

    it('requires a sufficiently long signing secret', () => {
        expect(() => new JoseTokenService('short')).toThrow();
    });
});
