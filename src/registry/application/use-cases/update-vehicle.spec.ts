import { describe, expect, it, vi } from 'vitest';
import { CpfCnpj } from '../../domain/customer/value-objects/cpf-cnpj.js';
import { Vehicle } from '../../domain/vehicle/vehicle.js';
import { Plate } from '../../domain/vehicle/value-objects/plate.js';
import type { VehicleRepository } from '../../domain/vehicle/vehicle.repository.js';
import { UpdateVehicle } from './update-vehicle.js';

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

    it('updates only the color and persists it', async () => {
        const vehicle = makeVehicle();
        const repository: VehicleRepository = {
            save: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            findById: vi.fn().mockResolvedValue(vehicle),
            findByPlate: vi.fn(),
        };

        const result = await new UpdateVehicle(repository).execute({
            id: 'vehicle-id',
            color: 'Silver',
        });

        expect(result.model).toBe('Civic');
        expect(result.year).toBe(2022);
        expect(result.brand).toBe('Honda');
        expect(result.color).toBe('Silver');
        expect(result.plate).toBe('ABC1234');
        expect(repository.update).toHaveBeenCalledWith(vehicle);
    });
});
