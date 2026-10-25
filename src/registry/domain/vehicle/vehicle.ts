import { AggregateRoot } from '../../../shared/domain/aggregate-root.js';
import type { CustomerId } from '../customer/customer-id.js';
import { VehicleId } from './vehicle-id.js';
import { VehicleRegistered } from './events/vehicle-registered.js';
import type { Plate } from './value-objects/plate.js';

export interface VehicleProps {
    id?: VehicleId | string | undefined;
    customerId: CustomerId;
    model: string;
    year: number;
    brand: string;
    color: string;
    plate: Plate;
    version?: number | undefined;
}

export class Vehicle extends AggregateRoot<VehicleId> {
    readonly customerId: CustomerId;
    model: string;
    year: number;
    brand: string;
    color: string;
    plate: Plate;

    constructor(
        id: VehicleId | string,
        customerId: CustomerId,
        model: string,
        year: number,
        brand: string,
        color: string,
        plate: Plate,
        version = 0,
    ) {
        const vehicleId = id instanceof VehicleId ? id : new VehicleId(id);
        super(vehicleId, version);
        this.customerId = customerId;
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
            props.customerId,
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
                customerId: vehicle.customerId.value,
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
