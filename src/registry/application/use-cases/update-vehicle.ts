import { ApplicationException } from '../../../shared/application/application-exception.js';
import type { UseCase } from '../../../shared/application/use-case.js';
import type { VehicleRepository } from '../../domain/vehicle/vehicle.repository.js';
import { VehicleId } from '../../domain/vehicle/vehicle-id.js';
import { Plate } from '../../domain/vehicle/value-objects/plate.js';

export class VehicleNotFoundForUpdateError extends ApplicationException {
    constructor() {
        super('Vehicle not found.');
    }
}

export class VehiclePlateAlreadyExistsOnUpdateError extends ApplicationException {
    constructor() {
        super('Vehicle with this plate already exists.');
    }
}

export interface UpdateVehicleInput {
    id: string;
    model: string;
    year: number;
    brand: string;
    color: string;
    plate: string;
}

export interface UpdateVehicleOutput {
    id: string;
    customerId: string;
    model: string;
    year: number;
    brand: string;
    color: string;
    plate: string;
}

export class UpdateVehicle implements UseCase<
    UpdateVehicleInput,
    UpdateVehicleOutput
> {
    constructor(private readonly vehicleRepository: VehicleRepository) {}

    async execute(input: UpdateVehicleInput): Promise<UpdateVehicleOutput> {
        const id = VehicleId.create(input.id);
        const vehicle = await this.vehicleRepository.findById(id);
        if (!vehicle) throw new VehicleNotFoundForUpdateError();

        const plate = Plate.create(input.plate);
        const existing = await this.vehicleRepository.findByPlate(plate);
        if (existing && existing.id.value !== vehicle.id.value) {
            throw new VehiclePlateAlreadyExistsOnUpdateError();
        }

        vehicle.update(
            input.model,
            input.year,
            input.brand,
            input.color,
            plate,
        );
        await this.vehicleRepository.update(vehicle);

        return {
            id: vehicle.id.value,
            customerId: vehicle.customerId.value,
            model: vehicle.model,
            year: vehicle.year,
            brand: vehicle.brand,
            color: vehicle.color,
            plate: vehicle.plate.value,
        };
    }
}
