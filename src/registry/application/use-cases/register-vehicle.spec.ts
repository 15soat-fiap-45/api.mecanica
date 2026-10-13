import { describe, expect, it, vi } from 'vitest';
import type { VehicleRepository } from '../../domain/vehicle/vehicle.repository.js';
import type { Vehicle } from '../../domain/vehicle/vehicle.js';
import { InvalidPlateException } from '../../domain/vehicle/value-objects/plate.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import {
    RegisterVehicle,
    VehicleAlreadyExistsError,
} from './register-vehicle.js';

describe('RegisterVehicle Use Case', () => {
    const validVehicleInput = {
        id: 'veh-1',
        model: 'Civic',
        year: 2022,
        brand: 'Honda',
        color: 'Black',
        plate: 'ABC-1234',
    };

    const makeRepository = (
        existingPlate: Vehicle | null = null,
        existingId: Vehicle | null = null,
    ): VehicleRepository => ({
        save: vi.fn().mockResolvedValue(undefined),
        findByPlate: vi.fn().mockResolvedValue(existingPlate),
        findById: vi.fn().mockResolvedValue(existingId),
    });

    const makeEventBus = (): EventBus => ({
        publish: vi.fn().mockResolvedValue(undefined),
        subscribe: vi.fn(),
    });

    it('should register a new vehicle successfully and publish domain event', async () => {
        const repository = makeRepository();
        const eventBus = makeEventBus();
        const useCase = new RegisterVehicle(repository, eventBus);

        const result = await useCase.execute(validVehicleInput);

        expect(result).toEqual({
            id: 'veh-1',
            model: 'Civic',
            year: 2022,
            brand: 'Honda',
            color: 'Black',
            plate: 'ABC1234',
        });
        expect(repository.save).toHaveBeenCalledTimes(1);
        expect(eventBus.publish).toHaveBeenCalledTimes(1);
        expect(eventBus.publish).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    eventName: 'registry.vehicle-registered',
                    aggregateId: 'veh-1',
                    model: 'Civic',
                    plate: 'ABC1234',
                }),
            ]),
        );
    });

    it('should throw VehicleAlreadyExistsError when vehicle plate already exists', async () => {
        const repository = makeRepository({} as Vehicle);
        const useCase = new RegisterVehicle(repository);

        await expect(useCase.execute(validVehicleInput)).rejects.toThrow(
            VehicleAlreadyExistsError,
        );
        expect(repository.save).not.toHaveBeenCalled();
    });

    it('should throw VehicleAlreadyExistsError when vehicle ID already exists', async () => {
        const repository = makeRepository(null, {} as Vehicle);
        const useCase = new RegisterVehicle(repository);

        await expect(useCase.execute(validVehicleInput)).rejects.toThrow(
            VehicleAlreadyExistsError,
        );
        expect(repository.save).not.toHaveBeenCalled();
    });

    it('should throw InvalidPlateException when plate format is invalid', async () => {
        const repository = makeRepository();
        const useCase = new RegisterVehicle(repository);

        await expect(
            useCase.execute({
                ...validVehicleInput,
                plate: 'INVALID-PLATE',
            }),
        ).rejects.toThrow(InvalidPlateException);
        expect(repository.save).not.toHaveBeenCalled();
    });
});
