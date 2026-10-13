import type { CustomerRepository } from '../../domain/customer/customer.repository.js';
import { Customer } from '../../domain/customer/customer.js';
import { CpfCnpj } from '../../domain/customer/value-objects/cpf-cnpj.js';
import { Email } from '../../domain/customer/value-objects/email.js';
import { Telephone } from '../../domain/customer/value-objects/telephone.js';
import type { EventBus } from '../../shared/application/event-bus.js';
import type { UseCase } from '../../shared/application/use-case.js';
import { ApplicationException } from '../shared/application-exception.js';

export class CustomerAlreadyExistsError extends ApplicationException {
    constructor() {
        super('Customer with this CPF/CNPJ already exists.');
    }
}

export interface RegisterCustomerInput {
    cpfCnpj: string;
    name: string;
    email: string;
    tel: string;
}

export interface RegisterCustomerOutput {
    cpfCnpj: string;
    name: string;
    email: string;
    tel: string;
}

export class RegisterCustomer implements UseCase<
    RegisterCustomerInput,
    RegisterCustomerOutput
> {
    constructor(
        private readonly customerRepository: CustomerRepository,
        private readonly eventBus?: EventBus,
    ) {}

    async execute(
        input: RegisterCustomerInput,
    ): Promise<RegisterCustomerOutput> {
        const customerId = CpfCnpj.create(input.cpfCnpj);

        const existingCustomer =
            await this.customerRepository.findByCpfCnpj(customerId);
        if (existingCustomer) {
            throw new CustomerAlreadyExistsError();
        }

        const email = Email.create(input.email);
        const tel = Telephone.create(input.tel);

        const customer = Customer.register({
            cpfCnpj: customerId,
            name: input.name,
            email,
            tel,
        });

        await this.customerRepository.save(customer);

        if (this.eventBus) {
            await this.eventBus.publish(customer.pullEvents());
        }

        return {
            cpfCnpj: customer.cpfCnpj.value,
            name: customer.name,
            email: customer.email.value,
            tel: customer.tel.value,
        };
    }
}
