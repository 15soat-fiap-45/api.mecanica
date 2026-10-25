import { BaseDomainEvent } from '../../../../shared/domain/domain-event.js';

export interface ServiceOrderFinishedProps {
    aggregateId: string;
}

export class ServiceOrderFinished extends BaseDomainEvent {
    readonly eventName = 'service-order.finished';

    constructor(props: ServiceOrderFinishedProps) {
        super(props.aggregateId);
        Object.freeze(this);
    }
}

export { ServiceOrderFinished as ServiceOrderFinishedEvent };
