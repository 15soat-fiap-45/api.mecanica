import { BaseDomainEvent } from '../../../../shared/domain/domain-event.js';

export interface BudgetApprovedProps {
    aggregateId: string;
    serviceOrderId: string;
    total: number;
}

export class BudgetApproved extends BaseDomainEvent {
    readonly eventName = 'service-order.budget-approved';
    readonly serviceOrderId: string;
    readonly total: number;

    constructor(props: BudgetApprovedProps) {
        super(props.aggregateId);
        this.serviceOrderId = props.serviceOrderId;
        this.total = props.total;
        Object.freeze(this);
    }
}

export { BudgetApproved as BudgetApprovedEvent };
