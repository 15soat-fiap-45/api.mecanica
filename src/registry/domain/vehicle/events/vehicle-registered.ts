import { BaseDomainEvent } from '../../../../shared/domain/domain-event.js';

export interface VehicleRegisteredProps {
    aggregateId: string;
    model: string;
    year: number;
    brand: string;
    color: string;
    plate: string;
}

export class VehicleRegistered extends BaseDomainEvent {
    readonly eventName = 'registry.vehicle-registered';
    readonly model: string;
    readonly year: number;
    readonly brand: string;
    readonly color: string;
    readonly plate: string;

    constructor(props: VehicleRegisteredProps) {
        super(props.aggregateId);
        this.model = props.model;
        this.year = props.year;
        this.brand = props.brand;
        this.color = props.color;
        this.plate = props.plate;
        Object.freeze(this);
    }
}

export { VehicleRegistered as VehicleRegisteredEvent };
