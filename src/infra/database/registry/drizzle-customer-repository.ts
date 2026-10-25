import { eq } from 'drizzle-orm';
import type { CustomerRepository } from '../../../registry/domain/customer/customer.repository.js';
import type { Customer } from '../../../registry/domain/customer/customer.js';
import { CpfCnpj } from '../../../registry/domain/customer/value-objects/cpf-cnpj.js';
import { db } from '../connection.js';
import { cliente } from '../schema.js';
import { customerFromRow, customerToRow } from './registry-mappers.js';
import {
    isUniqueConstraintViolation,
    RegistryAlreadyExistsError,
} from './registry-persistence-errors.js';

export class DrizzleCustomerRepository implements CustomerRepository {
    constructor(private readonly database: typeof db = db) {}

    async save(customer: Customer): Promise<void> {
        try {
            await this.database.insert(cliente).values(customerToRow(customer));
        } catch (error) {
            if (isUniqueConstraintViolation(error)) {
                throw new RegistryAlreadyExistsError('customer');
            }
            throw error;
        }
    }

    async findByCpfCnpj(cpfCnpj: CpfCnpj | string): Promise<Customer | null> {
        const document =
            typeof cpfCnpj === 'string' ? CpfCnpj.create(cpfCnpj) : cpfCnpj;
        const rows = await this.database
            .select()
            .from(cliente)
            .where(eq(cliente.clienteId, document.value))
            .limit(1);

        const row = rows[0];
        return row ? customerFromRow(row) : null;
    }
}
