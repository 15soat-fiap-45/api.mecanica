import type { VehicleRepository } from '../../domain/vehicle/vehicle.repository.js';
import { Plate } from '../../domain/vehicle/value-objects/plate.js';
import type { UseCase } from '../../../shared/application/use-case.js';
import { ApplicationException } from '../../../shared/application/application-exception.js';

export class VehicleNotFoundError extends ApplicationException {
    constructor() {
        super('Vehicle not found.');
    }
}

export interface FindVehicleByPlateInput {
    plate: string;
}

export interface FindVehicleByPlateOutput {
    id: string;
    model: string;
    year: number;
    brand: string;
    color: string;
    plate: string;
}

export class FindVehicleByPlate implements UseCase<
    FindVehicleByPlateInput,
    FindVehicleByPlateOutput
> {
    constructor(private readonly vehicleRepository: VehicleRepository) {}

    async execute(
        input: FindVehicleByPlateInput,
    ): Promise<FindVehicleByPlateOutput> {
        const plateVo = Plate.create(input.plate);

        const vehicle = await this.vehicleRepository.findByPlate(plateVo);
        if (!vehicle) {
            throw new VehicleNotFoundError();
        }

        return {
            id: vehicle.id.value,
            model: vehicle.model,
            year: vehicle.year,
            brand: vehicle.brand,
            color: vehicle.color,
            plate: vehicle.plate.value,
        };
    }
}
