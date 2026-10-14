import { describe, expect, it, vi } from 'vitest';
import type { ServiceOrderRepository } from '../../domain/service-order/service-order.repository.js';
import { ServiceOrder } from '../../domain/service-order/service-order.js';
import { SupplyItemAlreadyAddedException } from '../../domain/service-order/service-order.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import {
    AddSupplyToServiceOrder,
    ServiceOrderNotFoundError,
} from './add-supply-to-service-order.js';

describe('AddSupplyToServiceOrder Use Case', () => {
    const validInput = {
        serviceOrderId: 'os-1',
        partCode: 'past-freio-01',
        quantity: 2,
    };

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

    it('should add a supply item and publish AdditionalSuppliesIncluded', async () => {
        const serviceOrder = makeServiceOrder();
        const repository = makeRepository(serviceOrder);
        const eventBus = makeEventBus();
        const useCase = new AddSupplyToServiceOrder(repository, eventBus);

        const result = await useCase.execute(validInput);

        expect(result).toEqual({
            serviceOrderId: 'os-1',
            partCode: 'PAST-FREIO-01',
            quantity: 2,
        });
        expect(repository.save).toHaveBeenCalledTimes(1);
        expect(eventBus.publish).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    eventName: 'service-order.additional-supplies-included',
                    aggregateId: 'os-1',
                    items: [{ partCode: 'PAST-FREIO-01', quantity: 2 }],
                }),
            ]),
        );
    });

    it('should throw ServiceOrderNotFoundError when the order does not exist', async () => {
        const repository = makeRepository(null);
        const useCase = new AddSupplyToServiceOrder(repository);

        await expect(useCase.execute(validInput)).rejects.toThrow(
            ServiceOrderNotFoundError,
        );
        expect(repository.save).not.toHaveBeenCalled();
    });

    it('should throw SupplyItemAlreadyAddedException for a duplicated part code', async () => {
        const serviceOrder = makeServiceOrder();
        serviceOrder.addSupply('PAST-FREIO-01', 2);
        const repository = makeRepository(serviceOrder);
        const useCase = new AddSupplyToServiceOrder(repository);

        await expect(useCase.execute(validInput)).rejects.toThrow(
            SupplyItemAlreadyAddedException,
        );
        expect(repository.save).not.toHaveBeenCalled();
    });
});
