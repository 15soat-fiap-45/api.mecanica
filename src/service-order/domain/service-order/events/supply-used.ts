import { BaseDomainEvent } from '../../../../shared/domain/domain-event.js';

export interface SupplyUsedProps {
    aggregateId: string;
    partCode: string;
    quantity: number;
}

export class SupplyUsed extends BaseDomainEvent {
    readonly eventName = 'service-order.supply-used';
    readonly partCode: string;
    readonly quantity: number;

    constructor(props: SupplyUsedProps) {
        super(props.aggregateId);
        this.partCode = props.partCode;
        this.quantity = props.quantity;
        Object.freeze(this);
    }
}

export { SupplyUsed as SupplyUsedEvent };
