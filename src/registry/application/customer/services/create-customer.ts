import { Customer } from '../../../domain/customer/customer.js';
import { CpfCnpj } from '../../../domain/customer/value-objects/cpf-cnpj.js';
import { Email } from '../../../domain/customer/value-objects/email.js';
import { Telephone } from '../../../domain/customer/value-objects/telephone.js';
import type { CreateCustomerDTO } from '../dto/create-customer-dto.js';
import { CustomerAlreadyExistsError } from '../exceptions/customer-already-exists-error.js';
import type { CustomerRepository } from '../repositories/customer-repository.js';

export class CreateCustomer {
    constructor(private customerRepository: CustomerRepository) {}

    async execute({
        cpfCnpj,
        name,
        email,
        tel,
    }: CreateCustomerDTO): Promise<void> {
        const existingCustomer =
            await this.customerRepository.findByCpfCnpj(cpfCnpj);
        if (existingCustomer) {
            throw new CustomerAlreadyExistsError();
        }

        const customer = new Customer(
            CpfCnpj.create(cpfCnpj),
            name,
            Email.create(email),
            Telephone.create(tel),
        );

        await this.customerRepository.save(customer);
    }
}
