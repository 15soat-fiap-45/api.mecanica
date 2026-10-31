import { describe, expect, it, vi } from 'vitest';
import { Budget } from '../domain/budget/budget.js';
import { ServiceOrder } from '../domain/service-order/service-order.js';
import { OrderAwaitingApproval } from '../domain/service-order/events/order-awaiting-approval.js';
import { ApprovalRequest } from '../domain/approval/approval-request.js';
import { hashApprovalToken } from '../domain/approval/approval-token.js';
import type { ApprovalRequestRepository } from '../domain/approval/approval-request.repository.js';
import { SendBudgetApprovalEmail } from './handlers/send-budget-approval-email.js';
import { DecideBudgetApproval } from './use-cases/decide-budget-approval.js';

function setup() {
    const now = new Date('2026-10-26T12:00:00Z');
    const order = ServiceOrder.create({
        id: 'os-1',
        vehicleId: 'vehicle-1',
        description: '<Freios>',
    });
    order.awaitApproval('budget-1');
    order.pullEvents();
    const budget = Budget.create({
        id: 'budget-1',
        serviceOrderId: 'os-1',
        totalCents: 12345,
    });
    let request: ApprovalRequest | null = null;
    const approvals: ApprovalRequestRepository = {
        expirePending: vi.fn(async () => 0),
        issue: vi.fn(async (value) => {
            request = value;
        }),
        markSent: vi.fn(async (id) => {
            if (request && request.id === id) request.markSent(now);
        }),
        findByTokenHash: vi.fn(async (hash) =>
            request?.tokenHash === hash ? request : null,
        ),
        decide: vi.fn(async (value, changedBudget) => {
            if (request?.usedAt) throw new Error('concurrent');
            request = value;
            budget.reject();
            if (changedBudget.status.value === 'APPROVED') budget.approve();
        }),
    };
    const orders = { findById: vi.fn(async () => order), save: vi.fn() };
    const budgets = {
        findById: vi.fn(async () => budget),
        findByServiceOrderId: vi.fn(),
        save: vi.fn(),
    };
    const emails: { to: string; text: string; html: string }[] = [];
    const sender = {
        send: vi.fn(async (email) => {
            emails.push(email);
        }),
    };
    const contact = {
        findByVehicleId: vi.fn(async () => ({
            name: '<Cliente>',
            email: 'cliente@example.com',
            customerDocument: '52998224725',
        })),
    };
    const bus = { publish: vi.fn(), subscribe: vi.fn() };
    const handler = new SendBudgetApprovalEmail(
        approvals,
        orders,
        budgets,
        contact,
        sender,
        'https://example.com',
        60,
        () => now,
    );
    return {
        now,
        order,
        budget,
        approvals,
        orders,
        budgets,
        emails,
        sender,
        contact,
        bus,
        handler,
        getRequest: () => request,
    };
}

describe('budget approval flow', () => {
    it('issues a hashed token, sends to the registered vehicle owner and marks it sent', async () => {
        const flow = setup();
        await flow.handler.handle(
            new OrderAwaitingApproval({
                aggregateId: 'os-1',
                budgetId: 'budget-1',
            }),
        );
        expect(flow.getRequest()?.expiresAt).toEqual(
            new Date('2026-10-26T13:00:00Z'),
        );
        expect(flow.getRequest()?.sentAt).not.toBeNull();
        expect(flow.emails).toHaveLength(1);
        expect(flow.emails[0]?.to).toBe('cliente@example.com');
        expect(flow.emails[0]?.html).toContain('&lt;Cliente&gt;');
        const token = flow.emails[0]?.text.match(
            /orcamento\/([A-Za-z0-9_-]{43})/,
        )?.[1];
        expect(token).toBeTruthy();
        expect(flow.getRequest()?.tokenHash).toBe(hashApprovalToken(token!));
        expect(flow.emails[0]?.text).not.toContain(
            flow.getRequest()!.tokenHash,
        );
    });

    it('keeps the request pending when SMTP fails so the same handler can reissue a fresh link', async () => {
        const flow = setup();
        vi.mocked(flow.sender.send).mockRejectedValueOnce(
            new Error('SMTP down'),
        );
        const event = new OrderAwaitingApproval({
            aggregateId: 'os-1',
            budgetId: 'budget-1',
        });
        await expect(flow.handler.handle(event)).rejects.toThrow('SMTP down');
        const oldHash = flow.getRequest()?.tokenHash;
        expect(flow.getRequest()?.sentAt).toBeNull();
        await flow.handler.handle(event);
        expect(flow.getRequest()?.tokenHash).not.toBe(oldHash);
        expect(flow.getRequest()?.sentAt).not.toBeNull();
    });

    it('rejects a changed budget before consuming a token', async () => {
        const flow = setup();
        await flow.handler.handle(
            new OrderAwaitingApproval({
                aggregateId: 'os-1',
                budgetId: 'budget-1',
            }),
        );
        const token = flow.emails[0]!.text.match(
            /orcamento\/([A-Za-z0-9_-]{43})/,
        )![1]!;
        const changed = Budget.create({
            id: 'budget-1',
            serviceOrderId: 'os-1',
            totalCents: 25000,
            version: 2,
        });
        vi.mocked(flow.budgets.findById).mockResolvedValue(changed);
        await expect(
            new DecideBudgetApproval(
                flow.approvals,
                flow.orders,
                flow.budgets,
                flow.bus,
                () => flow.now,
            ).execute({ token, decision: 'approved' }),
        ).rejects.toThrow('changed');
        expect(flow.getRequest()?.usedAt).toBeNull();
    });

    it('refuses an expired token and an invalid token without touching the budget', async () => {
        const flow = setup();
        await flow.handler.handle(
            new OrderAwaitingApproval({
                aggregateId: 'os-1',
                budgetId: 'budget-1',
            }),
        );
        const token = flow.emails[0]!.text.match(
            /orcamento\/([A-Za-z0-9_-]{43})/,
        )![1]!;
        const decide = new DecideBudgetApproval(
            flow.approvals,
            flow.orders,
            flow.budgets,
            flow.bus,
            () => new Date('2026-10-26T13:00:00Z'),
        );
        await expect(
            decide.execute({ token, decision: 'approved' }),
        ).rejects.toThrow();
        await expect(
            decide.execute({ token: 'wrong', decision: 'approved' }),
        ).rejects.toThrow();
        expect(flow.approvals.decide).not.toHaveBeenCalled();
    });
});
