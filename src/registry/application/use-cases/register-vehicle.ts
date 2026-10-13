import type { VehicleRepository } from '../../domain/vehicle/vehicle.repository.js';
import { Vehicle } from '../../domain/vehicle/vehicle.js';
import { Plate } from '../../domain/vehicle/value-objects/plate.js';
import type { EventBus } from '../../shared/application/event-bus.js';
import type { UseCase } from '../../shared/application/use-case.js';
import { ApplicationException } from '../shared/application-exception.js';

export class VehicleAlreadyExistsError extends ApplicationException {
    constructor(message = 'Vehicle with this plate already exists.') {
        super(message);
    }
}

export interface RegisterVehicleInput {
    id?: string | undefined;
    model: string;
    year: number;
    brand: string;
    color: string;
    plate: string;
}

export interface RegisterVehicleOutput {
    id: string;
    model: string;
    year: number;
    brand: string;
    color: string;
    plate: string;
}

export class RegisterVehicle implements UseCase<
    RegisterVehicleInput,
    RegisterVehicleOutput
> {
    constructor(
        private readonly vehicleRepository: VehicleRepository,
        private readonly eventBus?: EventBus,
    ) {}

    async execute(input: RegisterVehicleInput): Promise<RegisterVehicleOutput> {
        const plateVo = Plate.create(input.plate);

        const existingByPlate =
            await this.vehicleRepository.findByPlate(plateVo);
        if (existingByPlate) {
            throw new VehicleAlreadyExistsError(
                'Vehicle with this plate already exists.',
            );
        }

        if (input.id) {
            const existingById = await this.vehicleRepository.findById(
                input.id,
            );
            if (existingById) {
                throw new VehicleAlreadyExistsError(
                    'Vehicle with this ID already exists.',
                );
            }
        }

        const vehicle = Vehicle.register({
            id: input.id,
            model: input.model,
            year: input.year,
            brand: input.brand,
            color: input.color,
            plate: plateVo,
        });

        await this.vehicleRepository.save(vehicle);

        if (this.eventBus) {
            await this.eventBus.publish(vehicle.pullEvents());
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
