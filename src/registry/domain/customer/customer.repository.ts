import type { Customer } from './customer.js';
import type { CustomerId } from './customer-id.js';

export interface CustomerRepository {
    save(customer: Customer): Promise<void>;
    findByCpfCnpj(cpfCnpj: CustomerId | string): Promise<Customer | null>;
}
