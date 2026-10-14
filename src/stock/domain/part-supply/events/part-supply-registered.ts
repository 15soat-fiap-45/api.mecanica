import { BaseDomainEvent } from '../../../../shared/domain/domain-event.js';

export interface PartSupplyRegisteredProps {
    aggregateId: string;
    description: string;
    partCode: string;
    initialQuantity: number;
    unitOfMeasure: string;
}

export class PartSupplyRegistered extends BaseDomainEvent {
    readonly eventName = 'stock.part-supply-registered';
    readonly description: string;
    readonly partCode: string;
    readonly initialQuantity: number;
    readonly unitOfMeasure: string;

    constructor(props: PartSupplyRegisteredProps) {
        super(props.aggregateId);
        this.description = props.description;
        this.partCode = props.partCode;
        this.initialQuantity = props.initialQuantity;
        this.unitOfMeasure = props.unitOfMeasure;
        Object.freeze(this);
    }
}

export { PartSupplyRegistered as PartSupplyRegisteredEvent };
