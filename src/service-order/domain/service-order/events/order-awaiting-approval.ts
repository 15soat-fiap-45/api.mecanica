import { BaseDomainEvent } from '../../../../shared/domain/domain-event.js';

export class OrderAwaitingApproval extends BaseDomainEvent {
    readonly eventName = 'service-order.awaiting-approval';

    constructor(props: { aggregateId: string; budgetId: string }) {
        super(props.aggregateId);
        this.budgetId = props.budgetId;
        Object.freeze(this);
    }

    readonly budgetId: string;
}
