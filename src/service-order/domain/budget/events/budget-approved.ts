import { BaseDomainEvent } from '../../../../shared/domain/domain-event.js';

export interface BudgetApprovedProps {
    aggregateId: string;
    serviceOrderId: string;
    totalCents: number;
}

export class BudgetApproved extends BaseDomainEvent {
    readonly eventName = 'service-order.budget-approved';
    readonly serviceOrderId: string;
    readonly totalCents: number;

    constructor(props: BudgetApprovedProps) {
        super(props.aggregateId);
        this.serviceOrderId = props.serviceOrderId;
        this.totalCents = props.totalCents;
        Object.freeze(this);
    }
}

export { BudgetApproved as BudgetApprovedEvent };
