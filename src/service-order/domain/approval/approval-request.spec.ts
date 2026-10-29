import { describe, expect, it } from 'vitest';
import { ApprovalRequest } from './approval-request.js';
import { generateApprovalToken, hashApprovalToken } from './approval-token.js';

describe('ApprovalRequest', () => {
    const now = new Date('2026-10-26T12:00:00Z');
    const make = () =>
        ApprovalRequest.create(
            {
                id: 'request-1',
                orderId: 'os-1',
                budgetId: 'budget-1',
                budgetVersion: 'version-2',
                tokenHash: 'a'.repeat(64),
                expiresAt: new Date(now.getTime() + 60000),
            },
            now,
        );

    it('stores a SHA-256 hash instead of the secret sent in the email', () => {
        const { token, tokenHash } = generateApprovalToken();
        expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
        expect(tokenHash).toBe(hashApprovalToken(token));
        expect(tokenHash).not.toContain(token);
    });

    it('expires exactly at the configured deadline', () => {
        const request = make();
        expect(request.isActive(new Date(now.getTime() + 59999))).toBe(true);
        expect(request.isActive(new Date(now.getTime() + 60000))).toBe(false);
    });

    it('can only be decided once and cannot be used after revocation', () => {
        const request = make();
        request.decide('approved', now);
        expect(request.decision).toBe('approved');
        expect(() => request.decide('rejected', now)).toThrow();
        const revoked = make();
        revoked.revoke(now);
        expect(() => revoked.decide('approved', now)).toThrow();
    });

    it('rejects past expiration dates', () => {
        expect(() =>
            ApprovalRequest.create(
                {
                    id: 'request-1',
                    orderId: 'os-1',
                    budgetId: 'budget-1',
                    budgetVersion: 'version-1',
                    tokenHash: 'a'.repeat(64),
                    expiresAt: now,
                },
                now,
            ),
        ).toThrow();
    });
});
