import { describe, expect, it, vi } from 'vitest';
import type { PartSupplyRepository } from '../../domain/part-supply/part-supply.repository.js';
import { PartSupply } from '../../domain/part-supply/part-supply.js';
import { PartCode } from '../../domain/part-supply/value-objects/part-code.js';
import { UnitOfMeasure } from '../../domain/part-supply/value-objects/unit-of-measure.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import {
    PartSupplyNotFoundError,
    RegisterStockEntry,
} from './register-stock-entry.js';

describe('RegisterStockEntry Use Case', () => {
    const validInput = {
        partCode: 'PAST-FREIO-01',
        quantity: 5,
    };

    const makePart = (): PartSupply =>
        PartSupply.create({
            id: 'pec-1',
            description: 'Front brake pad',
            partCode: PartCode.create(validInput.partCode),
            quantity: 10,
            unitOfMeasure: UnitOfMeasure.create('UNIT'),
        });

    const makeRepository = (
        part: PartSupply | null = makePart(),
    ): PartSupplyRepository => ({
        save: vi.fn().mockResolvedValue(undefined),
        findById: vi.fn().mockResolvedValue(null),
        findByPartCode: vi.fn().mockResolvedValue(part),
    });

    const makeEventBus = (): EventBus => ({
        publish: vi.fn().mockResolvedValue(undefined),
        subscribe: vi.fn(),
    });

    it('should increase stock and publish StockUpdated event', async () => {
        const part = makePart();
        const repository = makeRepository(part);
        const eventBus = makeEventBus();
        const useCase = new RegisterStockEntry(repository, eventBus);

        const result = await useCase.execute(validInput);

        expect(result).toEqual({
            id: 'pec-1',
            partCode: 'PAST-FREIO-01',
            quantity: 15,
        });
        expect(part.quantity.value).toBe(15);
        expect(repository.save).toHaveBeenCalledTimes(1);
        expect(eventBus.publish).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    eventName: 'stock.stock-updated',
                    movementType: 'ENTRY',
                    movedQuantity: 5,
                    previousQuantity: 10,
                    currentQuantity: 15,
                }),
            ]),
        );
    });

    it('should throw PartSupplyNotFoundError when part does not exist', async () => {
        const repository = makeRepository(null);
        const useCase = new RegisterStockEntry(repository);

        await expect(useCase.execute(validInput)).rejects.toThrow(
            PartSupplyNotFoundError,
        );
        expect(repository.save).not.toHaveBeenCalled();
    });
});
