import { BaseDomainEvent } from '../../../../shared/domain/domain-event.js';

export interface IncludedSupplyItemProps {
    partCode: string;
    quantity: number;
}

export interface AdditionalSuppliesIncludedProps {
    aggregateId: string;
    items: IncludedSupplyItemProps[];
}

export class AdditionalSuppliesIncluded extends BaseDomainEvent {
    readonly eventName = 'service-order.additional-supplies-included';
    readonly items: IncludedSupplyItemProps[];

    constructor(props: AdditionalSuppliesIncludedProps) {
        super(props.aggregateId);
        this.items = props.items;
        Object.freeze(this);
    }
}

export { AdditionalSuppliesIncluded as AdditionalSuppliesIncludedEvent };
