import { BaseDomainEvent } from '../../../../shared/domain/domain-event.js';

export interface ServiceOrderCancelledProps {
    aggregateId: string;
}

export class ServiceOrderCancelled extends BaseDomainEvent {
    readonly eventName = 'service-order.cancelled';

    constructor(props: ServiceOrderCancelledProps) {
        super(props.aggregateId);
        Object.freeze(this);
    }
}

export { ServiceOrderCancelled as ServiceOrderCancelledEvent };
