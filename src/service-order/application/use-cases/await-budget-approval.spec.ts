import { describe, expect, it, vi } from 'vitest';
import { ServiceOrder } from '../../domain/service-order/service-order.js';
import {
    AwaitBudgetApproval,
    EmptyBudgetError,
} from './await-budget-approval.js';

describe('AwaitBudgetApproval', () => {
    const order = () =>
        ServiceOrder.create({
            id: 'os-1',
            description: 'Freios',
            vehicleId: 'vehicle-1',
        });

    it('generates the budget from services and parts, saving budget and order atomically before announcing approval', async () => {
        const os = order();
        os.addService({
            serviceId: 'svc-1',
            name: 'Troca de pastilhas',
            priceCents: 18000,
        });
        os.addSupply('PAST-FREIO-01', 2, {
            description: 'Pastilha dianteira',
            unitPriceCents: 8500,
        });
        const saveOrder = vi.fn(async (savedOrder, budget) => {
            expect(savedOrder.status.value).toBe('AWAITING_APPROVAL');
            expect(savedOrder.description).toBe(
                'Pastilhas desgastadas; substituir.',
            );
            expect(budget?.totalCents).toBe(35000);
        });
        const saveBudget = vi.fn();
        const publish = vi.fn(async (events) => {
            expect(saveOrder).toHaveBeenCalledOnce();
            expect(saveBudget).not.toHaveBeenCalled();
            expect(events.at(-1).budgetId).toBeTruthy();
        });
        const result = await new AwaitBudgetApproval(
            { findById: vi.fn(async () => os), save: saveOrder },
            {
                findById: vi.fn(),
                findByServiceOrderId: vi.fn(),
                save: saveBudget,
            },
            { publish, subscribe: vi.fn() },
        ).execute({
            serviceOrderId: 'os-1',
            description: '  Pastilhas desgastadas; substituir.  ',
        });
        expect(result).toEqual({
            status: 'AWAITING_APPROVAL',
            totalCents: 35000,
        });
        expect(publish).toHaveBeenCalledOnce();
    });

    it('keeps the order description when omitted in the input', async () => {
        const os = order();
        os.addService({
            serviceId: 'svc-1',
            name: 'Alinhamento',
            priceCents: 22000,
        });
        const saveOrder = vi.fn(async (savedOrder, budget) => {
            expect(savedOrder.description).toBe('Freios');
            expect(budget?.totalCents).toBe(22000);
        });
        await new AwaitBudgetApproval(
            { findById: vi.fn(async () => os), save: saveOrder },
            {
                findById: vi.fn(),
                findByServiceOrderId: vi.fn(),
                save: vi.fn(),
            },
            { publish: vi.fn(), subscribe: vi.fn() },
        ).execute({ serviceOrderId: 'os-1' });
        expect(saveOrder).toHaveBeenCalledOnce();
    });

    it('does not send an order without services or parts for approval', async () => {
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
                { publish: vi.fn(), subscribe: vi.fn() },
            ).execute({ serviceOrderId: 'os-1' }),
        ).rejects.toThrow(EmptyBudgetError);
        expect(saveOrder).not.toHaveBeenCalled();
        expect(saveBudget).not.toHaveBeenCalled();
    });
});
