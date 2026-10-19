import { describe, expect, it, vi } from 'vitest';
import type { ServiceOrderRepository } from '../../domain/service-order/service-order.repository.js';
import { ServiceOrder } from '../../domain/service-order/service-order.js';
import { InvalidServiceOrderStatusException } from '../../domain/service-order/value-objects/service-order-status.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import { ServiceOrderNotFoundError } from './add-supply-to-service-order.js';
import { CancelServiceOrder } from './cancel-service-order.js';

describe('CancelServiceOrder Use Case', () => {
    const validInput = { serviceOrderId: 'os-1' };

    const makeServiceOrder = (): ServiceOrder =>
        ServiceOrder.register({
            id: 'os-1',
            description: 'Troca de pastilhas',
        });

    const makeRepository = (
        serviceOrder: ServiceOrder | null = makeServiceOrder(),
    ): ServiceOrderRepository => ({
        save: vi.fn().mockResolvedValue(undefined),
        findById: vi.fn().mockResolvedValue(serviceOrder),
    });

    const makeEventBus = (): EventBus => ({
        publish: vi.fn().mockResolvedValue(undefined),
        subscribe: vi.fn(),
    });

    it('should cancel the order and publish ServiceOrderCancelled so the stock is released', async () => {
        const serviceOrder = makeServiceOrder();
        const repository = makeRepository(serviceOrder);
        const eventBus = makeEventBus();
        const useCase = new CancelServiceOrder(repository, eventBus);

        const result = await useCase.execute(validInput);

        expect(result).toEqual({ serviceOrderId: 'os-1', status: 'CANCELLED' });
        expect(repository.save).toHaveBeenCalledTimes(1);
        expect(eventBus.publish).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    eventName: 'service-order.cancelled',
                    aggregateId: 'os-1',
                }),
            ]),
        );
    });

    it('should be idempotent: an already cancelled order is returned as-is without a new event', async () => {
        const serviceOrder = makeServiceOrder();
        serviceOrder.cancel();
        const repository = makeRepository(serviceOrder);
        const eventBus = makeEventBus();
        const useCase = new CancelServiceOrder(repository, eventBus);

        const result = await useCase.execute(validInput);

        expect(result.status).toBe('CANCELLED');
        expect(repository.save).not.toHaveBeenCalled();
        expect(eventBus.publish).not.toHaveBeenCalled();
    });

    it('should throw ServiceOrderNotFoundError when the order does not exist', async () => {
        const repository = makeRepository(null);
        const useCase = new CancelServiceOrder(repository);

        await expect(useCase.execute(validInput)).rejects.toThrow(
            ServiceOrderNotFoundError,
        );
        expect(repository.save).not.toHaveBeenCalled();
    });

    it('should not cancel a completed order', async () => {
        const serviceOrder = makeServiceOrder();
        serviceOrder.approve();
        serviceOrder.startExecution();
        serviceOrder.finish();
        const repository = makeRepository(serviceOrder);
        const useCase = new CancelServiceOrder(repository);

        await expect(useCase.execute(validInput)).rejects.toThrow(
            InvalidServiceOrderStatusException,
        );
        expect(repository.save).not.toHaveBeenCalled();
    });
});
