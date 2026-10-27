import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { expect, it, vi } from 'vitest';
import { ApprovalRequest } from '../../../service-order/domain/approval/approval-request.js';
import { Budget } from '../../../service-order/domain/budget/budget.js';
import { DrizzleApprovalRequestRepository } from './drizzle-approval-request-repository.js';

vi.mock('../connection.js', () => ({ db: {} }));

it('revokes old pending links and inserts a new request in one transaction', async () => {
    const query = vi.fn(
        async (config: { text: string }, params: unknown[] = []) => ({
            rows: config.text.includes('returning') ? [[params[0]]] : [],
        }),
    );
    const db = drizzle({ query } as unknown as Pool);
    const request = ApprovalRequest.create(
        {
            id: 'new',
            orderId: 'os-1',
            budgetId: 'budget-1',
            budgetVersion: 'v1',
            tokenHash: 'a'.repeat(64),
            expiresAt: new Date('2026-10-26T13:00:00Z'),
        },
        new Date('2026-10-26T12:00:00Z'),
    );
    await new DrizzleApprovalRequestRepository(db).issue(request);
    const statements = query.mock.calls.map(([config]) => config.text);
    expect(statements[0]).toBe('begin');
    expect(statements[1]).toContain(
        'update "service_order"."approval_requests"',
    );
    expect(statements[2]).toContain(
        'insert into "service_order"."approval_requests"',
    );
    expect(statements[3]).toBe('commit');
    expect(JSON.stringify(query.mock.calls)).not.toContain('base64url');
});

it('rolls back both approval use and budget decision if a concurrent click wins', async () => {
    const query = vi.fn(async (config: { text: string }) => ({
        rows: config.text.includes('returning') ? [] : [],
    }));
    const db = drizzle({ query } as unknown as Pool);
    const request = ApprovalRequest.create(
        {
            id: 'new',
            orderId: 'os-1',
            budgetId: 'budget-1',
            budgetVersion: 'v1',
            tokenHash: 'a'.repeat(64),
            expiresAt: new Date('2026-10-26T13:00:00Z'),
        },
        new Date('2026-10-26T12:00:00Z'),
    );
    request.decide('approved', new Date('2026-10-26T12:01:00Z'));
    const budget = Budget.create({
        id: 'budget-1',
        serviceOrderId: 'os-1',
        totalCents: 100,
    });
    budget.approve();
    await expect(
        new DrizzleApprovalRequestRepository(db).decide(request, budget, 0),
    ).rejects.toThrow();
    const statements = query.mock.calls.map(([config]) => config.text);
    expect(statements.at(-1)).toBe('rollback');
    expect(statements).not.toContain('commit');
});

it('does not decide against an order version changed between reading and locking', async () => {
    const query = vi.fn(async (config: { text: string }) => ({
        rows: config.text.includes('from "service_order"."orders"')
            ? [['os-1', 3]]
            : config.text.includes('returning')
              ? [['new']]
              : [],
    }));
    const db = drizzle({ query } as unknown as Pool);
    const request = ApprovalRequest.create(
        {
            id: 'new',
            orderId: 'os-1',
            budgetId: 'budget-1',
            budgetVersion: 'v1',
            tokenHash: 'a'.repeat(64),
            expiresAt: new Date('2026-10-26T13:00:00Z'),
        },
        new Date('2026-10-26T12:00:00Z'),
    );
    request.decide('approved', new Date('2026-10-26T12:01:00Z'));
    const budget = Budget.create({
        id: 'budget-1',
        serviceOrderId: 'os-1',
        totalCents: 100,
    });
    budget.approve();
    await expect(
        new DrizzleApprovalRequestRepository(db).decide(request, budget, 2),
    ).rejects.toThrow();
    const statements = query.mock.calls.map(([config]) => config.text);
    expect(statements.at(-1)).toBe('rollback');
    expect(
        statements.some((s) => s.includes('update "service_order"."budgets"')),
    ).toBe(false);
});

it('rejects the service order in the same transaction as the budget and token', async () => {
    const query = vi.fn(async (config: { text: string }) => ({
        rows: config.text.includes('from "service_order"."orders"')
            ? [['os-1', 0]]
            : config.text.includes('returning')
              ? [['new']]
              : [],
    }));
    const db = drizzle({ query } as unknown as Pool);
    const request = ApprovalRequest.create(
        {
            id: 'new',
            orderId: 'os-1',
            budgetId: 'budget-1',
            budgetVersion: 'v1',
            tokenHash: 'a'.repeat(64),
            expiresAt: new Date('2026-10-26T13:00:00Z'),
        },
        new Date('2026-10-26T12:00:00Z'),
    );
    request.decide('rejected', new Date('2026-10-26T12:01:00Z'));
    const budget = Budget.create({
        id: 'budget-1',
        serviceOrderId: 'os-1',
        totalCents: 100,
    });
    budget.reject();
    await new DrizzleApprovalRequestRepository(db).decide(request, budget, 0);
    const statements = query.mock.calls.map(([config]) => config.text);
    expect(
        statements.some((s) => s.includes('update "service_order"."orders"')),
    ).toBe(true);
    expect(statements.at(-1)).toBe('commit');
});

it('filters eligible AWAITING_APPROVAL orders before applying the 100 limit in expirePending (100 cancelled + 1 awaiting approval)', async () => {
    const now = new Date('2026-10-26T14:00:00Z');
    const expiredAt = new Date('2026-10-26T13:00:00Z');
    const allExpiredLinks = [
        ...Array.from({ length: 100 }, (_, i) => ({
            id: `req-cancelled-${i}`,
            orderId: `os-cancelled-${i}`,
            budgetId: `budget-cancelled-${i}`,
            orderStatus: 'CANCELLED',
        })),
        {
            id: 'req-101',
            orderId: 'os-101',
            budgetId: 'budget-101',
            orderStatus: 'AWAITING_APPROVAL',
        },
    ];
    const query = vi.fn(
        async (config: { text: string }, params: unknown[] = []) => {
            if (config.text.includes('inner join "service_order"."orders"')) {
                const statusFilter = params[1];
                const limit = Number(params[2]);
                return {
                    rows: allExpiredLinks
                        .filter((r) => r.orderStatus === statusFilter)
                        .slice(0, limit)
                        .map((r) => [r.id, r.orderId, r.budgetId]),
                };
            }
            if (config.text.includes('from "service_order"."orders"')) {
                return { rows: [['os-101']] };
            }
            if (
                config.text.includes('from "service_order"."approval_requests"')
            ) {
                return { rows: [['req-101', expiredAt, null, null]] };
            }
            if (config.text.includes('update "service_order"."budgets"')) {
                return { rows: [['budget-101', 4000]] };
            }
            return { rows: [] };
        },
    );
    const db = drizzle({ query } as unknown as Pool);
    const expiredCount = await new DrizzleApprovalRequestRepository(
        db,
    ).expirePending(now);
    expect(expiredCount).toBe(1);
    const selectSql = query.mock.calls[0]?.[0].text ?? '';
    expect(selectSql).toContain('inner join "service_order"."orders"');
    expect(selectSql).toContain('"service_order"."orders"."status" = $');
    expect(selectSql).toContain('limit $');
});
