import { describe, expect, it, vi } from 'vitest';
import type { ServiceOrderRepository } from '../../domain/service-order/service-order.repository.js';
import { ServiceOrder } from '../../domain/service-order/service-order.js';
import { BudgetApproved } from '../../domain/budget/events/budget-approved.js';
import { ServiceOrderNotFoundError } from '../use-cases/add-supply-to-service-order.js';
import { MoveServiceOrderToApproved } from './move-service-order-to-approved.js';

describe('MoveServiceOrderToApproved Handler', () => {
    const makeEvent = (): BudgetApproved =>
        new BudgetApproved({
            aggregateId: 'orc-1',
            serviceOrderId: 'os-1',
            totalCents: 45090,
        });

    const makeRepository = (
        serviceOrder: ServiceOrder | null,
    ): ServiceOrderRepository => ({
        save: vi.fn().mockResolvedValue(undefined),
        findById: vi.fn().mockResolvedValue(serviceOrder),
    });

    it('should move the service order to APPROVED when the budget is approved', async () => {
        const serviceOrder = ServiceOrder.register({
            id: 'os-1',
            description: 'Troca de pastilhas',
        });
        const repository = makeRepository(serviceOrder);
        const handler = new MoveServiceOrderToApproved(repository);

        await handler.handle(makeEvent());

        expect(serviceOrder.status.value).toBe('APPROVED');
        expect(repository.save).toHaveBeenCalledTimes(1);
        expect(repository.findById).toHaveBeenCalledWith('os-1');
    });

    it('should be idempotent: an already approved order is skipped', async () => {
        const serviceOrder = ServiceOrder.register({
            id: 'os-1',
            description: 'Troca de pastilhas',
        });
        const repository = makeRepository(serviceOrder);
        const handler = new MoveServiceOrderToApproved(repository);

        await handler.handle(makeEvent());
        await handler.handle(makeEvent());

        expect(serviceOrder.status.value).toBe('APPROVED');
        // save only on the first delivery
        expect(repository.save).toHaveBeenCalledTimes(1);
    });

    it('should skip an order that already moved past APPROVED instead of throwing', async () => {
        const serviceOrder = ServiceOrder.register({
            id: 'os-1',
            description: 'Troca de pastilhas',
        });
        serviceOrder.approve();
        serviceOrder.startExecution();
        const repository = makeRepository(serviceOrder);
        const handler = new MoveServiceOrderToApproved(repository);

        // A second budget approved while the repair is already in progress
        // (or a late redelivery) must not break the handler.
        await handler.handle(makeEvent());

        expect(serviceOrder.status.value).toBe('IN_PROGRESS');
        expect(repository.save).not.toHaveBeenCalled();
    });

    it('should throw ServiceOrderNotFoundError when the order does not exist', async () => {
        const repository = makeRepository(null);
        const handler = new MoveServiceOrderToApproved(repository);

        await expect(handler.handle(makeEvent())).rejects.toThrow(
            ServiceOrderNotFoundError,
        );
        expect(repository.save).not.toHaveBeenCalled();
    });
});
