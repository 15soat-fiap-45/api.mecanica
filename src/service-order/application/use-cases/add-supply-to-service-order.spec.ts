import { describe, expect, it, vi } from 'vitest';
import type { ServiceOrderRepository } from '../../domain/service-order/service-order.repository.js';
import { ServiceOrder } from '../../domain/service-order/service-order.js';
import { SupplyItemAlreadyAddedException } from '../../domain/service-order/service-order.js';
import { InvalidServiceOrderStatusException } from '../../domain/service-order/value-objects/service-order-status.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import {
    AddSupplyToServiceOrder,
    PartNotFoundError,
    ServiceOrderNotFoundError,
} from './add-supply-to-service-order.js';
import type { PartCatalog } from '../ports/part-catalog.js';

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

    const parts: PartCatalog = {
        findByPartCode: vi.fn(async (code: string) =>
            code.toUpperCase() === 'PAST-FREIO-01'
                ? {
                      description: 'Pastilha de freio dianteira',
                      unitPriceCents: 8500,
                  }
                : null,
        ),
    };

    const makeEventBus = (): EventBus => ({
        publish: vi.fn().mockResolvedValue(undefined),
        subscribe: vi.fn(),
    });

    it('should add a supply item and publish AdditionalSuppliesIncluded', async () => {
        const serviceOrder = makeServiceOrder();
        const repository = makeRepository(serviceOrder);
        const eventBus = makeEventBus();
        const useCase = new AddSupplyToServiceOrder(
            repository,
            parts,
            eventBus,
        );

        const result = await useCase.execute(validInput);

        expect(result).toEqual({
            serviceOrderId: 'os-1',
            partCode: 'PAST-FREIO-01',
            quantity: 2,
            description: 'Pastilha de freio dianteira',
            unitPriceCents: 8500,
        });
        expect(serviceOrder.totalCents).toBe(17000);
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
        const useCase = new AddSupplyToServiceOrder(repository, parts);

        await expect(useCase.execute(validInput)).rejects.toThrow(
            ServiceOrderNotFoundError,
        );
        expect(repository.save).not.toHaveBeenCalled();
    });

    it('should throw InvalidServiceOrderStatusException when the order is completed', async () => {
        const serviceOrder = makeServiceOrder();
        serviceOrder.approve();
        serviceOrder.startExecution();
        serviceOrder.finish();
        const repository = makeRepository(serviceOrder);
        const useCase = new AddSupplyToServiceOrder(repository, parts);

        await expect(useCase.execute(validInput)).rejects.toThrow(
            InvalidServiceOrderStatusException,
        );
        expect(repository.save).not.toHaveBeenCalled();
    });

    it('should throw SupplyItemAlreadyAddedException for a duplicated part code', async () => {
        const serviceOrder = makeServiceOrder();
        serviceOrder.addSupply('PAST-FREIO-01', 2);
        const repository = makeRepository(serviceOrder);
        const useCase = new AddSupplyToServiceOrder(repository, parts);

        await expect(useCase.execute(validInput)).rejects.toThrow(
            SupplyItemAlreadyAddedException,
        );
        expect(repository.save).not.toHaveBeenCalled();
    });

    it('should throw PartNotFoundError when the part is not in stock', async () => {
        const repository = makeRepository();
        const useCase = new AddSupplyToServiceOrder(repository, parts);

        await expect(
            useCase.execute({ ...validInput, partCode: 'NAO-EXISTE' }),
        ).rejects.toThrow(PartNotFoundError);
        expect(repository.save).not.toHaveBeenCalled();
    });
});
