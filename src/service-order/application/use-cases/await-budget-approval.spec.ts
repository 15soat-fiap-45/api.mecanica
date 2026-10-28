import { describe, expect, it, vi } from 'vitest';
import { ServiceOrder } from '../../domain/service-order/service-order.js';
import { AwaitBudgetApproval } from './await-budget-approval.js';

describe('AwaitBudgetApproval', () => {
    const order = (valueCents: number | null = null) =>
        ServiceOrder.create({
            id: 'os-1',
            description: 'Freios',
            vehicleId: 'vehicle-1',
            valueCents,
        });

    it('uses valueCents provided in the input, saves the budget and order atomically before announcing approval', async () => {
        const os = order();
        const saveOrder = vi.fn(async (savedOrder, budget) => {
            expect(savedOrder.status.value).toBe('AWAITING_APPROVAL');
            expect(savedOrder.valueCents).toBe(35000);
            expect(budget?.totalCents).toBe(35000);
        });
        const saveBudget = vi.fn();
        const publish = vi.fn(async (events) => {
            expect(saveOrder).toHaveBeenCalledOnce();
            expect(saveBudget).not.toHaveBeenCalled();
            expect(events[0].budgetId).toBeTruthy();
        });
        await new AwaitBudgetApproval(
            { findById: vi.fn(async () => os), save: saveOrder },
            {
                findById: vi.fn(),
                findByServiceOrderId: vi.fn(),
                save: saveBudget,
            },
            { publish, subscribe: vi.fn() },
        ).execute({ serviceOrderId: 'os-1', valueCents: 35000 });
        expect(publish).toHaveBeenCalledOnce();
    });

    it('uses valueCents already defined on the order when omitted in the input', async () => {
        const os = order(22000);
        const saveOrder = vi.fn(async (savedOrder, budget) => {
            expect(savedOrder.status.value).toBe('AWAITING_APPROVAL');
            expect(savedOrder.valueCents).toBe(22000);
            expect(budget?.totalCents).toBe(22000);
        });
        const saveBudget = vi.fn();
        await new AwaitBudgetApproval(
            { findById: vi.fn(async () => os), save: saveOrder },
            {
                findById: vi.fn(),
                findByServiceOrderId: vi.fn(),
                save: saveBudget,
            },
            { publish: vi.fn(), subscribe: vi.fn() },
        ).execute({ serviceOrderId: 'os-1' });
        expect(saveOrder).toHaveBeenCalledOnce();
    });

    it('does not allow an order without valueCents to be sent for approval', async () => {
        const saveOrder = vi.fn();
        const saveBudget = vi.fn();
        await expect(
            new AwaitBudgetApproval(
                { findById: vi.fn(async () => order(null)), save: saveOrder },
                {
                    findById: vi.fn(),
                    findByServiceOrderId: vi.fn(),
                    save: saveBudget,
                },
                { publish: vi.fn(), subscribe: vi.fn() },
            ).execute({ serviceOrderId: 'os-1' }),
        ).rejects.toThrow();
        expect(saveOrder).not.toHaveBeenCalled();
        expect(saveBudget).not.toHaveBeenCalled();
    });
});
