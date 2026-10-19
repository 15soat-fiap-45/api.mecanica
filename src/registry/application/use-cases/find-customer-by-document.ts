import type { CustomerRepository } from '../../domain/customer/customer.repository.js';
import { CpfCnpj } from '../../domain/customer/value-objects/cpf-cnpj.js';
import type { UseCase } from '../../../shared/application/use-case.js';
import { ApplicationException } from '../../../shared/application/application-exception.js';

export class CustomerNotFoundError extends ApplicationException {
    constructor() {
        super('Customer not found.');
    }
}

export interface FindCustomerByDocumentInput {
    document: string;
}

export interface FindCustomerByDocumentOutput {
    cpfCnpj: string;
    name: string;
    email: string;
    tel: string;
}

export class FindCustomerByDocument implements UseCase<
    FindCustomerByDocumentInput,
    FindCustomerByDocumentOutput
> {
    constructor(private readonly customerRepository: CustomerRepository) {}

    async execute(
        input: FindCustomerByDocumentInput,
    ): Promise<FindCustomerByDocumentOutput> {
        const customerId = CpfCnpj.create(input.document);

        const customer =
            await this.customerRepository.findByCpfCnpj(customerId);
        if (!customer) {
            throw new CustomerNotFoundError();
        }

        return {
            cpfCnpj: customer.cpfCnpj.value,
            name: customer.name,
            email: customer.email.value,
            tel: customer.tel.value,
        };
    }
}
