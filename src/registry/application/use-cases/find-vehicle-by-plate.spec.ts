import { describe, expect, it, vi } from 'vitest';
import type { VehicleRepository } from '../../domain/vehicle/vehicle.repository.js';
import { Vehicle } from '../../domain/vehicle/vehicle.js';
import {
    InvalidPlateException,
    Plate,
} from '../../domain/vehicle/value-objects/plate.js';
import {
    FindVehicleByPlate,
    VehicleNotFoundError,
} from './find-vehicle-by-plate.js';

describe('FindVehicleByPlate Use Case', () => {
    const validPlate = 'ABC-1234';
    const mockVehicle = new Vehicle(
        'veh-1',
        'Civic',
        2022,
        'Honda',
        'Black',
        Plate.create(validPlate),
    );

    it('should return vehicle output when vehicle is found', async () => {
        const repository: VehicleRepository = {
            save: vi.fn(),
            findById: vi.fn(),
            findByPlate: vi.fn().mockResolvedValue(mockVehicle),
        };
        const useCase = new FindVehicleByPlate(repository);

        const result = await useCase.execute({ plate: validPlate });

        expect(result).toEqual({
            id: 'veh-1',
            model: 'Civic',
            year: 2022,
            brand: 'Honda',
            color: 'Black',
            plate: 'ABC1234',
        });
        expect(repository.findByPlate).toHaveBeenCalledTimes(1);
    });

    it('should throw VehicleNotFoundError when vehicle is not found', async () => {
        const repository: VehicleRepository = {
            save: vi.fn(),
            findById: vi.fn(),
            findByPlate: vi.fn().mockResolvedValue(null),
        };
        const useCase = new FindVehicleByPlate(repository);

        await expect(useCase.execute({ plate: validPlate })).rejects.toThrow(
            VehicleNotFoundError,
        );
    });

    it('should throw InvalidPlateException when plate format is invalid', async () => {
        const repository: VehicleRepository = {
            save: vi.fn(),
            findById: vi.fn(),
            findByPlate: vi.fn(),
        };
        const useCase = new FindVehicleByPlate(repository);

        await expect(useCase.execute({ plate: 'INVALID' })).rejects.toThrow(
            InvalidPlateException,
        );
        expect(repository.findByPlate).not.toHaveBeenCalled();
    });
});
