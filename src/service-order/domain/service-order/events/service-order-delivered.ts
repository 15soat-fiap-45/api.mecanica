import { BaseDomainEvent } from '../../../../shared/domain/domain-event.js';

export interface ServiceOrderDeliveredProps {
    aggregateId: string;
}

export class ServiceOrderDelivered extends BaseDomainEvent {
    readonly eventName = 'service-order.delivered';

    constructor(props: ServiceOrderDeliveredProps) {
        super(props.aggregateId);
        Object.freeze(this);
    }
}

export { ServiceOrderDelivered as ServiceOrderDeliveredEvent };
