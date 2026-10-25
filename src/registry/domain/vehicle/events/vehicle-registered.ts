import { BaseDomainEvent } from '../../../../shared/domain/domain-event.js';

export interface VehicleRegisteredProps {
    aggregateId: string;
    customerId: string;
    model: string;
    year: number;
    brand: string;
    color: string;
    plate: string;
}

export class VehicleRegistered extends BaseDomainEvent {
    readonly eventName = 'registry.vehicle-registered';
    readonly customerId: string;
    readonly model: string;
    readonly year: number;
    readonly brand: string;
    readonly color: string;
    readonly plate: string;

    constructor(props: VehicleRegisteredProps) {
        super(props.aggregateId);
        this.customerId = props.customerId;
        this.model = props.model;
        this.year = props.year;
        this.brand = props.brand;
        this.color = props.color;
        this.plate = props.plate;
        Object.freeze(this);
    }
}

export { VehicleRegistered as VehicleRegisteredEvent };
