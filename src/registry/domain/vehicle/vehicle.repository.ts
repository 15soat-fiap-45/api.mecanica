import type { Vehicle } from './vehicle.js';
import type { VehicleId } from './vehicle-id.js';
import type { Plate } from './value-objects/plate.js';

export interface VehicleRepository {
    save(vehicle: Vehicle): Promise<void>;
    update(vehicle: Vehicle): Promise<void>;
    delete(id: VehicleId | string): Promise<void>;
    findById(id: VehicleId | string): Promise<Vehicle | null>;
    findByPlate(plate: Plate | string): Promise<Vehicle | null>;
}
