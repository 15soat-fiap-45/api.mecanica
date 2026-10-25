import { describe, expect, it, vi } from 'vitest';
import type { PartSupplyRepository } from '../../domain/part-supply/part-supply.repository.js';
import type { SupplyReservationRepository } from '../../domain/supply-reservation/supply-reservation.repository.js';
import { SupplyReservation } from '../../domain/supply-reservation/supply-reservation.js';
import { PartSupply } from '../../domain/part-supply/part-supply.js';
import { PartCode } from '../../../shared/domain/part-code.js';
import { InsufficientQuantityException } from '../../domain/part-supply/value-objects/quantity.js';
import { UnitOfMeasure } from '../../domain/part-supply/value-objects/unit-of-measure.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import { PartSupplyNotFoundError, ReserveSupply } from './reserve-supply.js';

describe('ReserveSupply Use Case', () => {
    const validInput = {
        serviceOrderId: 'os-1',
        partCode: 'PAST-FREIO-01',
        quantity: 3,
    };

    const makePart = (): PartSupply =>
        PartSupply.create({
            id: 'pec-1',
            description: 'Front brake pad',
            partCode: PartCode.create(validInput.partCode),
            quantity: 10,
            unitOfMeasure: UnitOfMeasure.create('UNIT'),
        });

    const makePartRepository = (
        part: PartSupply | null = makePart(),
    ): PartSupplyRepository => ({
        save: vi.fn().mockResolvedValue(undefined),
        findById: vi.fn().mockResolvedValue(null),
        findByPartCode: vi.fn().mockResolvedValue(part),
    });

    const makeReservationRepository = (
        existingReservation: SupplyReservation | null = null,
    ): SupplyReservationRepository => ({
        save: vi.fn().mockResolvedValue(undefined),
        findById: vi.fn().mockResolvedValue(null),
        findByPartSupplyId: vi.fn().mockResolvedValue([]),
        findByServiceOrderId: vi.fn().mockResolvedValue([]),
        findByServiceOrderIdAndPartSupply: vi
            .fn()
            .mockResolvedValue(existingReservation),
    });

    const makeEventBus = (): EventBus => ({
        publish: vi.fn().mockResolvedValue(undefined),
        subscribe: vi.fn(),
    });

    it('should create a reservation, decrease available stock and publish event', async () => {
        const part = makePart();
        const partRepository = makePartRepository(part);
        const reservationRepository = makeReservationRepository();
        const eventBus = makeEventBus();
        const useCase = new ReserveSupply(
            partRepository,
            reservationRepository,
            eventBus,
        );

        const result = await useCase.execute(validInput);

        expect(result).toMatchObject({
            partSupplyId: 'pec-1',
            partCode: 'PAST-FREIO-01',
            quantity: 3,
            status: 'PENDING',
            availableQuantity: 7,
        });
        expect(result.id).toBeTruthy();
        expect(part.quantity.value).toBe(7);
        expect(partRepository.save).toHaveBeenCalledTimes(1);
        expect(reservationRepository.save).toHaveBeenCalledTimes(1);
        expect(eventBus.publish).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    eventName: 'stock.stock-updated',
                    movementType: 'EXIT',
                    movedQuantity: 3,
                    previousQuantity: 10,
                    currentQuantity: 7,
                }),
            ]),
        );
    });

    it('should be idempotent: same service order and supply do not reserve twice', async () => {
        const part = makePart();
        const useCase = new ReserveSupply(
            makePartRepository(part),
            makeReservationRepository(),
        );
        const firstResult = await useCase.execute(validInput);

        // Second delivery of the same event: the previously created
        // reservation is found by the service order + supply key.
        const persistedReservation = SupplyReservation.create({
            id: firstResult.id,
            partSupplyId: 'pec-1',
            serviceOrderId: 'os-1',
            quantity: 3,
        });
        const partRepository = makePartRepository(part);
        const reservationRepository =
            makeReservationRepository(persistedReservation);
        const secondUseCase = new ReserveSupply(
            partRepository,
            reservationRepository,
        );

        const secondResult = await secondUseCase.execute(validInput);

        expect(secondResult.id).toBe(firstResult.id);
        expect(reservationRepository.save).not.toHaveBeenCalled();
        // stock is not deducted again
        expect(part.quantity.value).toBe(7);
    });

    it('should reserve again when the previous reservation for the same order + supply was cancelled', async () => {
        const part = makePart();
        const cancelledReservation = SupplyReservation.create({
            id: 'res-1',
            partSupplyId: 'pec-1',
            serviceOrderId: 'os-1',
            quantity: 3,
        });
        cancelledReservation.cancel();
        const partRepository = makePartRepository(part);
        const reservationRepository =
            makeReservationRepository(cancelledReservation);
        const useCase = new ReserveSupply(
            partRepository,
            reservationRepository,
        );

        const result = await useCase.execute(validInput);

        // a CANCELLED reservation must not count as "already reserved":
        // a new reservation is created and the stock is deducted
        expect(result.id).not.toBe('res-1');
        expect(result.status).toBe('PENDING');
        expect(part.quantity.value).toBe(7);
        expect(reservationRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should reserve again when the previous reservation for the same order + supply was consumed', async () => {
        const part = makePart();
        const consumedReservation = SupplyReservation.create({
            id: 'res-1',
            partSupplyId: 'pec-1',
            serviceOrderId: 'os-1',
            quantity: 3,
        });
        consumedReservation.confirm();
        consumedReservation.consume();
        const partRepository = makePartRepository(part);
        const reservationRepository =
            makeReservationRepository(consumedReservation);
        const useCase = new ReserveSupply(
            partRepository,
            reservationRepository,
        );

        const result = await useCase.execute(validInput);

        expect(result.id).not.toBe('res-1');
        expect(part.quantity.value).toBe(7);
        expect(reservationRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should throw PartSupplyNotFoundError when part does not exist', async () => {
        const partRepository = makePartRepository(null);
        const reservationRepository = makeReservationRepository();
        const useCase = new ReserveSupply(
            partRepository,
            reservationRepository,
        );

        await expect(useCase.execute(validInput)).rejects.toThrow(
            PartSupplyNotFoundError,
        );
        expect(reservationRepository.save).not.toHaveBeenCalled();
    });

    it('should throw InsufficientQuantityException when stock is not enough', async () => {
        const partRepository = makePartRepository();
        const reservationRepository = makeReservationRepository();
        const useCase = new ReserveSupply(
            partRepository,
            reservationRepository,
        );

        await expect(
            useCase.execute({ ...validInput, quantity: 11 }),
        ).rejects.toThrow(InsufficientQuantityException);
        expect(partRepository.save).not.toHaveBeenCalled();
        expect(reservationRepository.save).not.toHaveBeenCalled();
    });
});
