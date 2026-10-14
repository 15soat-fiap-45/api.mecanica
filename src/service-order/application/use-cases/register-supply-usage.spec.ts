import { describe, expect, it, vi } from 'vitest';
import type { ServiceOrderRepository } from '../../domain/service-order/service-order.repository.js';
import {
    ServiceOrder,
    SupplyItemNotFoundException,
} from '../../domain/service-order/service-order.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import { ServiceOrderNotFoundError } from './add-supply-to-service-order.js';
import { RegisterSupplyUsage } from './register-supply-usage.js';

describe('RegisterSupplyUsage Use Case', () => {
    const validInput = {
        serviceOrderId: 'os-1',
        partCode: 'past-freio-01',
    };

    const makeServiceOrder = (): ServiceOrder => {
        const serviceOrder = ServiceOrder.register({
            id: 'os-1',
            description: 'Troca de pastilhas',
        });
        serviceOrder.addSupply('PAST-FREIO-01', 2);
        serviceOrder.approve();
        serviceOrder.pullEvents();
        return serviceOrder;
    };

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

    it('should mark the supply as used and publish SupplyUsed', async () => {
        const serviceOrder = makeServiceOrder();
        const repository = makeRepository(serviceOrder);
        const eventBus = makeEventBus();
        const useCase = new RegisterSupplyUsage(repository, eventBus);

        const result = await useCase.execute(validInput);

        expect(result).toEqual({
            serviceOrderId: 'os-1',
            partCode: 'PAST-FREIO-01',
            quantity: 2,
            used: true,
        });
        expect(repository.save).toHaveBeenCalledTimes(1);
        expect(eventBus.publish).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    eventName: 'service-order.supply-used',
                    aggregateId: 'os-1',
                    partCode: 'PAST-FREIO-01',
                    quantity: 2,
                }),
            ]),
        );
    });

    it('should throw ServiceOrderNotFoundError when the order does not exist', async () => {
        const repository = makeRepository(null);
        const useCase = new RegisterSupplyUsage(repository);

        await expect(useCase.execute(validInput)).rejects.toThrow(
            ServiceOrderNotFoundError,
        );
        expect(repository.save).not.toHaveBeenCalled();
    });

    it('should throw SupplyItemNotFoundException when the item is not in the order', async () => {
        const repository = makeRepository();
        const useCase = new RegisterSupplyUsage(repository);

        await expect(
            useCase.execute({ ...validInput, partCode: 'OLEO-5W30' }),
        ).rejects.toThrow(SupplyItemNotFoundException);
        expect(repository.save).not.toHaveBeenCalled();
    });
});
