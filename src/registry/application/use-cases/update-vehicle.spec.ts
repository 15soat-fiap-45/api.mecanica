import { describe, expect, it, vi } from 'vitest';
import { CpfCnpj } from '../../domain/customer/value-objects/cpf-cnpj.js';
import { Vehicle } from '../../domain/vehicle/vehicle.js';
import { Plate } from '../../domain/vehicle/value-objects/plate.js';
import type { VehicleRepository } from '../../domain/vehicle/vehicle.repository.js';
import {
    UpdateVehicle,
    VehiclePlateAlreadyExistsOnUpdateError,
} from './update-vehicle.js';

describe('UpdateVehicle', () => {
    const makeVehicle = (plate = 'ABC-1234') =>
        Vehicle.create({
            id: 'vehicle-id',
            customerId: CpfCnpj.create('52998224725'),
            model: 'Civic',
            year: 2022,
            brand: 'Honda',
            color: 'Black',
            plate: Plate.create(plate),
        });

    it('updates vehicle data and persists it', async () => {
        const vehicle = makeVehicle();
        const repository: VehicleRepository = {
            save: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            findById: vi.fn().mockResolvedValue(vehicle),
            findByPlate: vi.fn().mockResolvedValue(vehicle),
        };

        const result = await new UpdateVehicle(repository).execute({
            id: 'vehicle-id',
            model: 'Civic Touring',
            year: 2023,
            brand: 'Honda',
            color: 'Silver',
            plate: 'ABC-1234',
        });

        expect(result.model).toBe('Civic Touring');
        expect(repository.update).toHaveBeenCalledWith(vehicle);
    });

    it('rejects a plate already used by another vehicle', async () => {
        const vehicle = makeVehicle();
        const otherVehicle = Vehicle.create({
            ...vehicle,
            id: 'other-vehicle-id',
            plate: Plate.create('DEF-5678'),
        });
        const repository: VehicleRepository = {
            save: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            findById: vi.fn().mockResolvedValue(vehicle),
            findByPlate: vi.fn().mockResolvedValue(otherVehicle),
        };

        await expect(
            new UpdateVehicle(repository).execute({
                id: 'vehicle-id',
                model: 'Civic',
                year: 2022,
                brand: 'Honda',
                color: 'Black',
                plate: 'DEF-5678',
            }),
        ).rejects.toThrow(VehiclePlateAlreadyExistsOnUpdateError);
    });
});
