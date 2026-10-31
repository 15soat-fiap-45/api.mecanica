import { describe, expect, it, vi } from 'vitest';
import type { PartSupplyRepository } from '../../domain/part-supply/part-supply.repository.js';
import type { PartSupply } from '../../domain/part-supply/part-supply.js';
import { InvalidPartCodeException } from '../../../shared/domain/part-code.js';
import { InvalidPartPriceException } from '../../domain/part-supply/part-supply.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import {
    RegisterPartSupply,
    PartSupplyAlreadyRegisteredError,
} from './register-part-supply.js';

describe('RegisterPartSupply Use Case', () => {
    const validInput = {
        id: 'pec-1',
        description: 'Front brake pad',
        partCode: 'past-freio-01',
        quantity: 10,
        unitOfMeasure: 'unit',
        unitPriceCents: 8990,
    };

    const makeRepository = (
        existingByCode: PartSupply | null = null,
        existingById: PartSupply | null = null,
    ): PartSupplyRepository => ({
        save: vi.fn().mockResolvedValue(undefined),
        findById: vi.fn().mockResolvedValue(existingById),
        findByPartCode: vi.fn().mockResolvedValue(existingByCode),
    });

    const makeEventBus = (): EventBus => ({
        publish: vi.fn().mockResolvedValue(undefined),
        subscribe: vi.fn(),
    });

    it('should register a new part-supply successfully and publish domain event', async () => {
        const repository = makeRepository();
        const eventBus = makeEventBus();
        const useCase = new RegisterPartSupply(repository, eventBus);

        const result = await useCase.execute(validInput);

        expect(result).toEqual({
            id: 'pec-1',
            description: 'Front brake pad',
            partCode: 'PAST-FREIO-01',
            quantity: 10,
            unitOfMeasure: 'UNIT',
            unitPriceCents: 8990,
        });
        expect(repository.save).toHaveBeenCalledTimes(1);
        expect(eventBus.publish).toHaveBeenCalledTimes(1);
        expect(eventBus.publish).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    eventName: 'stock.part-supply-registered',
                    aggregateId: 'pec-1',
                    partCode: 'PAST-FREIO-01',
                    initialQuantity: 10,
                }),
            ]),
        );
    });

    it('should generate an id and default quantity to zero when not provided', async () => {
        const repository = makeRepository();
        const useCase = new RegisterPartSupply(repository);

        const result = await useCase.execute({
            description: '5W30 oil',
            partCode: 'OLEO-5W30',
            unitOfMeasure: 'LITER',
        });

        expect(result.id).toBeTruthy();
        expect(result.quantity).toBe(0);
        expect(repository.save).toHaveBeenCalledTimes(1);
    });

    it('should throw PartSupplyAlreadyRegisteredError when code already exists', async () => {
        const repository = makeRepository({} as PartSupply);
        const useCase = new RegisterPartSupply(repository);

        await expect(useCase.execute(validInput)).rejects.toThrow(
            PartSupplyAlreadyRegisteredError,
        );
        expect(repository.save).not.toHaveBeenCalled();
    });

    it('should throw PartSupplyAlreadyRegisteredError when id already exists', async () => {
        const repository = makeRepository(null, {} as PartSupply);
        const useCase = new RegisterPartSupply(repository);

        await expect(useCase.execute(validInput)).rejects.toThrow(
            PartSupplyAlreadyRegisteredError,
        );
        expect(repository.save).not.toHaveBeenCalled();
    });

    it('should throw InvalidPartCodeException when code format is invalid', async () => {
        const repository = makeRepository();
        const useCase = new RegisterPartSupply(repository);

        await expect(
            useCase.execute({ ...validInput, partCode: 'AB' }),
        ).rejects.toThrow(InvalidPartCodeException);
        expect(repository.save).not.toHaveBeenCalled();
    });

    it('should default the unit price to zero and reject an invalid price', async () => {
        const useCase = new RegisterPartSupply(makeRepository());
        await expect(
            useCase.execute({ ...validInput, unitPriceCents: undefined }),
        ).resolves.toMatchObject({
            unitPriceCents: 0,
        });
        await expect(
            useCase.execute({ ...validInput, unitPriceCents: -1 }),
        ).rejects.toThrow(InvalidPartPriceException);
    });
});
