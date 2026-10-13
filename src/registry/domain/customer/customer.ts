import { AggregateRoot } from '../../shared/domain/aggregate-root.js';
import type { CustomerId } from './customer-id.js';
import { CustomerRegistered } from './events/customer-registered.js';
import type { Email } from './value-objects/email.js';
import type { Telephone } from './value-objects/telephone.js';

export interface CustomerProps {
    cpfCnpj: CustomerId;
    name: string;
    email: Email;
    tel: Telephone;
    version?: number;
}

export class Customer extends AggregateRoot<CustomerId> {
    name: string;
    email: Email;
    tel: Telephone;

    constructor(
        cpfCnpj: CustomerId,
        name: string,
        email: Email,
        tel: Telephone,
        version = 0,
    ) {
        super(cpfCnpj, version);
        this.name = name;
        this.email = email;
        this.tel = tel;
    }

    get cpfCnpj(): CustomerId {
        return this.id;
    }

    static create(props: CustomerProps): Customer {
        return new Customer(
            props.cpfCnpj,
            props.name,
            props.email,
            props.tel,
            props.version ?? 0,
        );
    }

    static register(props: CustomerProps): Customer {
        const customer = Customer.create(props);
        customer.record(
            new CustomerRegistered({
                aggregateId: customer.id.value,
                name: customer.name,
                email: customer.email.value,
                tel: customer.tel.value,
            }),
        );
        return customer;
    }
}
