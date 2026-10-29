import { describe, expect, it, vi } from 'vitest';
import { Email } from '../../../shared/domain/email.js';
import { Customer } from '../../domain/customer/customer.js';
import { CpfCnpj } from '../../domain/customer/value-objects/cpf-cnpj.js';
import { Telephone } from '../../domain/customer/value-objects/telephone.js';
import type { CustomerRepository } from '../../domain/customer/customer.repository.js';
import {
    CustomerNotFoundForUpdateError,
    UpdateCustomer,
} from './update-customer.js';

describe('UpdateCustomer', () => {
    it('updates only email and telephone and persists them', async () => {
        const customer = Customer.create({
            cpfCnpj: CpfCnpj.create('52998224725'),
            name: 'John Doe',
            email: Email.create('john.doe@example.com'),
            tel: Telephone.create('11987654321'),
        });
        const repository: CustomerRepository = {
            save: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            findByCpfCnpj: vi.fn().mockResolvedValue(customer),
        };

        const result = await new UpdateCustomer(repository).execute({
            cpfCnpj: '52998224725',
            email: 'jane.doe@example.com',
            tel: '11999998888',
        });

        expect(result.name).toBe('John Doe');
        expect(result.email).toBe('jane.doe@example.com');
        expect(result.tel).toBe('11999998888');
        expect(repository.update).toHaveBeenCalledWith(customer);
    });

    it('rejects an unknown customer', async () => {
        const repository: CustomerRepository = {
            save: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            findByCpfCnpj: vi.fn().mockResolvedValue(null),
        };

        await expect(
            new UpdateCustomer(repository).execute({
                cpfCnpj: '52998224725',
                email: 'jane.doe@example.com',
                tel: '11999998888',
            }),
        ).rejects.toThrow(CustomerNotFoundForUpdateError);
    });
});
