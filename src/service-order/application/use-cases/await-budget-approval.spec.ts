import { describe, expect, it, vi } from 'vitest';
import { ServiceOrder } from '../../domain/service-order/service-order.js';
import { AwaitBudgetApproval } from './await-budget-approval.js';

describe('AwaitBudgetApproval', () => {
    const order = () =>
        ServiceOrder.create({
            id: 'os-1',
            description: 'Freios',
            vehicleId: 'vehicle-1',
        });
    const services = (
        rows = [
            {
                id: 1,
                title: 'Diagnóstico',
                valueCents: 10000,
                description: null,
                partIds: [],
            },
            {
                id: 2,
                title: 'Reparo',
                valueCents: 25000,
                description: null,
                partIds: [],
            },
        ],
    ) => ({
        create: vi.fn(),
        assign: vi.fn(),
        list: vi.fn(),
        forOrder: vi.fn(async () => rows),
    });

    it('adds prices of multiple services, saves the budget and order atomically before announcing approval', async () => {
        const os = order();
        const saveOrder = vi.fn(async (savedOrder, budget) => {
            expect(savedOrder.status.value).toBe('AWAITING_APPROVAL');
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
            services(),
            { publish, subscribe: vi.fn() },
        ).execute({ serviceOrderId: 'os-1' });
        expect(publish).toHaveBeenCalledOnce();
    });

    it('does not allow an empty quote to be sent', async () => {
        const saveOrder = vi.fn();
        const saveBudget = vi.fn();
        await expect(
            new AwaitBudgetApproval(
                { findById: vi.fn(async () => order()), save: saveOrder },
                {
                    findById: vi.fn(),
                    findByServiceOrderId: vi.fn(),
                    save: saveBudget,
                },
                services([]),
                { publish: vi.fn(), subscribe: vi.fn() },
            ).execute({ serviceOrderId: 'os-1' }),
        ).rejects.toThrow();
        expect(saveOrder).not.toHaveBeenCalled();
        expect(saveBudget).not.toHaveBeenCalled();
    });
});
