import { ApplicationException } from '../../../shared/application/application-exception.js';
import type { CustomerRepository } from '../../domain/customer/customer.repository.js';
import { CpfCnpj } from '../../domain/customer/value-objects/cpf-cnpj.js';
import type { UseCase } from '../../../shared/application/use-case.js';

export class CustomerNotFoundForDeleteError extends ApplicationException {
    constructor() {
        super('Customer not found.');
    }
}

export interface DeleteCustomerInput {
    cpfCnpj: string;
}

export class DeleteCustomer implements UseCase<DeleteCustomerInput, void> {
    constructor(private readonly customerRepository: CustomerRepository) {}

    async execute(input: DeleteCustomerInput): Promise<void> {
        const cpfCnpj = CpfCnpj.create(input.cpfCnpj);
        const customer = await this.customerRepository.findByCpfCnpj(cpfCnpj);
        if (!customer) throw new CustomerNotFoundForDeleteError();
        await this.customerRepository.delete(cpfCnpj);
    }
}
