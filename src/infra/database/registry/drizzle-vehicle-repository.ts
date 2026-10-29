import { eq } from 'drizzle-orm';
import type { VehicleRepository } from '../../../registry/domain/vehicle/vehicle.repository.js';
import type { Vehicle } from '../../../registry/domain/vehicle/vehicle.js';
import { VehicleId } from '../../../registry/domain/vehicle/vehicle-id.js';
import { Plate } from '../../../registry/domain/vehicle/value-objects/plate.js';
import { db } from '../connection.js';
import { veiculo } from '../schema.js';
import { vehicleFromRow, vehicleToRow } from './registry-mappers.js';
import {
    isUniqueConstraintViolation,
    RegistryAlreadyExistsError,
} from './registry-persistence-errors.js';

export class DrizzleVehicleRepository implements VehicleRepository {
    constructor(private readonly database: typeof db = db) {}

    async save(vehicle: Vehicle): Promise<void> {
        try {
            await this.database.insert(veiculo).values(vehicleToRow(vehicle));
        } catch (error) {
            if (isUniqueConstraintViolation(error)) {
                throw new RegistryAlreadyExistsError('vehicle');
            }
            throw error;
        }
    }

    async update(vehicle: Vehicle): Promise<void> {
        try {
            await this.database
                .update(veiculo)
                .set(vehicleToRow(vehicle))
                .where(eq(veiculo.veiculoId, vehicle.id.value));
        } catch (error) {
            if (isUniqueConstraintViolation(error)) {
                throw new RegistryAlreadyExistsError('vehicle');
            }
            throw error;
        }
    }

    async delete(id: VehicleId | string): Promise<void> {
        const vehicleId = typeof id === 'string' ? VehicleId.create(id) : id;
        await this.database
            .delete(veiculo)
            .where(eq(veiculo.veiculoId, vehicleId.value));
    }

    async findById(id: VehicleId | string): Promise<Vehicle | null> {
        const vehicleId = typeof id === 'string' ? VehicleId.create(id) : id;
        const rows = await this.database
            .select()
            .from(veiculo)
            .where(eq(veiculo.veiculoId, vehicleId.value))
            .limit(1);

        const row = rows[0];
        return row ? vehicleFromRow(row) : null;
    }

    async findByPlate(plate: Plate | string): Promise<Vehicle | null> {
        const plateValue =
            typeof plate === 'string' ? Plate.create(plate) : plate;
        const rows = await this.database
            .select()
            .from(veiculo)
            .where(eq(veiculo.placa, plateValue.value))
            .limit(1);

        const row = rows[0];
        return row ? vehicleFromRow(row) : null;
    }
}
