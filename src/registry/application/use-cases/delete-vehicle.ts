import { ApplicationException } from '../../../shared/application/application-exception.js';
import type { UseCase } from '../../../shared/application/use-case.js';
import type { VehicleRepository } from '../../domain/vehicle/vehicle.repository.js';
import { VehicleId } from '../../domain/vehicle/vehicle-id.js';

export class VehicleNotFoundForDeleteError extends ApplicationException {
    constructor() {
        super('Vehicle not found.');
    }
}

export interface DeleteVehicleInput {
    id: string;
}

export class DeleteVehicle implements UseCase<DeleteVehicleInput, void> {
    constructor(private readonly vehicleRepository: VehicleRepository) {}

    async execute(input: DeleteVehicleInput): Promise<void> {
        const id = VehicleId.create(input.id);
        const vehicle = await this.vehicleRepository.findById(id);
        if (!vehicle) throw new VehicleNotFoundForDeleteError();
        await this.vehicleRepository.delete(id);
    }
}
