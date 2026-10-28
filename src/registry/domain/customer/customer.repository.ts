import type { Customer } from './customer.js';
import type { CustomerId } from './customer-id.js';

export interface CustomerRepository {
    save(customer: Customer): Promise<void>;
    update(customer: Customer): Promise<void>;
    delete(cpfCnpj: CustomerId | string): Promise<void>;
    findByCpfCnpj(cpfCnpj: CustomerId | string): Promise<Customer | null>;
}
