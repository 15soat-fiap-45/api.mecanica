import { BaseDomainEvent } from '../../../../shared/domain/domain-event.js';

export interface ServiceOrderExecutionStartedProps {
    aggregateId: string;
}

export class ServiceOrderExecutionStarted extends BaseDomainEvent {
    readonly eventName = 'service-order.execution-started';

    constructor(props: ServiceOrderExecutionStartedProps) {
        super(props.aggregateId);
        Object.freeze(this);
    }
}

export { ServiceOrderExecutionStarted as ServiceOrderExecutionStartedEvent };
