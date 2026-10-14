import { BaseDomainEvent } from '../../../../shared/domain/domain-event.js';

export interface ServiceOrderRegisteredProps {
    aggregateId: string;
    description: string;
}

export class ServiceOrderRegistered extends BaseDomainEvent {
    readonly eventName = 'service-order.registered';
    readonly description: string;

    constructor(props: ServiceOrderRegisteredProps) {
        super(props.aggregateId);
        this.description = props.description;
        Object.freeze(this);
    }
}

export { ServiceOrderRegistered as ServiceOrderRegisteredEvent };
