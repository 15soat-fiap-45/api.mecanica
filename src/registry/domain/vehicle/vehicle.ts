import { AggregateRoot } from '../../shared/domain/aggregate-root.js';
import { VehicleId } from './vehicle-id.js';
import { VehicleRegistered } from './events/vehicle-registered.js';
import type { Plate } from './value-objects/plate.js';

export interface VehicleProps {
    id?: VehicleId | string;
    model: string;
    year: number;
    brand: string;
    color: string;
    plate: Plate;
    version?: number;
}

export class Vehicle extends AggregateRoot<VehicleId> {
    model: string;
    year: number;
    brand: string;
    color: string;
    plate: Plate;

    constructor(
        id: VehicleId | string,
        model: string,
        year: number,
        brand: string,
        color: string,
        plate: Plate,
        version = 0,
    ) {
        const vehicleId = id instanceof VehicleId ? id : new VehicleId(id);
        super(vehicleId, version);
        this.model = model;
        this.year = year;
        this.brand = brand;
        this.color = color;
        this.plate = plate;
    }

    static create(props: VehicleProps): Vehicle {
        const id =
            props.id instanceof VehicleId ? props.id : new VehicleId(props.id);
        return new Vehicle(
            id,
            props.model,
            props.year,
            props.brand,
            props.color,
            props.plate,
            props.version ?? 0,
        );
    }

    static register(props: VehicleProps): Vehicle {
        const vehicle = Vehicle.create(props);
        vehicle.record(
            new VehicleRegistered({
                aggregateId: vehicle.id.value,
                model: vehicle.model,
                year: vehicle.year,
                brand: vehicle.brand,
                color: vehicle.color,
                plate: vehicle.plate.value,
            }),
        );
        return vehicle;
    }
}
