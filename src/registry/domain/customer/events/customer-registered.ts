import { BaseDomainEvent } from '../../../../shared/domain/domain-event.js';

export interface CustomerRegisteredProps {
    aggregateId: string;
    name: string;
    email: string;
    tel: string;
}

export class CustomerRegistered extends BaseDomainEvent {
    readonly eventName = 'registry.customer-registered';
    readonly name: string;
    readonly email: string;
    readonly tel: string;

    constructor(payload: CustomerRegisteredProps) {
        super(payload.aggregateId);
        this.name = payload.name;
        this.email = payload.email;
        this.tel = payload.tel;
        Object.freeze(this);
    }
}

export { CustomerRegistered as CustomerRegisteredEvent };
