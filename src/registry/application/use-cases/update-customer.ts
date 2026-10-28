import { ApplicationException } from '../../../shared/application/application-exception.js';
import { Email } from '../../../shared/domain/email.js';
import type { CustomerRepository } from '../../domain/customer/customer.repository.js';
import { CpfCnpj } from '../../domain/customer/value-objects/cpf-cnpj.js';
import { Telephone } from '../../domain/customer/value-objects/telephone.js';
import type { UseCase } from '../../../shared/application/use-case.js';

export class CustomerNotFoundForUpdateError extends ApplicationException {
    constructor() {
        super('Customer not found.');
    }
}

export interface UpdateCustomerInput {
    cpfCnpj: string;
    name: string;
    email: string;
    tel: string;
}

export interface UpdateCustomerOutput {
    cpfCnpj: string;
    name: string;
    email: string;
    tel: string;
}

export class UpdateCustomer implements UseCase<
    UpdateCustomerInput,
    UpdateCustomerOutput
> {
    constructor(private readonly customerRepository: CustomerRepository) {}

    async execute(input: UpdateCustomerInput): Promise<UpdateCustomerOutput> {
        const cpfCnpj = CpfCnpj.create(input.cpfCnpj);
        const customer = await this.customerRepository.findByCpfCnpj(cpfCnpj);
        if (!customer) throw new CustomerNotFoundForUpdateError();

        customer.update(
            input.name,
            Email.create(input.email),
            Telephone.create(input.tel),
        );
        await this.customerRepository.update(customer);

        return {
            cpfCnpj: customer.cpfCnpj.value,
            name: customer.name,
            email: customer.email.value,
            tel: customer.tel.value,
        };
    }
}
