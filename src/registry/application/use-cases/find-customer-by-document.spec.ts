import { describe, expect, it, vi } from 'vitest';
import type { CustomerRepository } from '../../domain/customer/customer.repository.js';
import { Customer } from '../../domain/customer/customer.js';
import { InvalidDocumentException } from '../../domain/customer/exceptions/InvalidDocumentException.js';
import { CpfCnpj } from '../../domain/customer/value-objects/cpf-cnpj.js';
import { Email } from '../../../shared/domain/email.js';
import { Telephone } from '../../domain/customer/value-objects/telephone.js';
import {
    CustomerNotFoundError,
    FindCustomerByDocument,
} from './find-customer-by-document.js';

describe('FindCustomerByDocument Use Case', () => {
    const validCpf = '52998224725';
    const mockCustomer = new Customer(
        CpfCnpj.create(validCpf),
        'John Doe',
        Email.create('john.doe@example.com'),
        Telephone.create('11987654321'),
    );

    it('should return customer output when found', async () => {
        const repository: CustomerRepository = {
            save: vi.fn(),
            findByCpfCnpj: vi.fn().mockResolvedValue(mockCustomer),
        };
        const useCase = new FindCustomerByDocument(repository);

        const result = await useCase.execute({ document: validCpf });

        expect(result).toEqual({
            cpfCnpj: validCpf,
            name: 'John Doe',
            email: 'john.doe@example.com',
            tel: '11987654321',
        });
        expect(repository.findByCpfCnpj).toHaveBeenCalledTimes(1);
    });

    it('should throw CustomerNotFoundError when customer is not found', async () => {
        const repository: CustomerRepository = {
            save: vi.fn(),
            findByCpfCnpj: vi.fn().mockResolvedValue(null),
        };
        const useCase = new FindCustomerByDocument(repository);

        await expect(useCase.execute({ document: validCpf })).rejects.toThrow(
            CustomerNotFoundError,
        );
    });

    it('should throw InvalidDocumentException when document is invalid', async () => {
        const repository: CustomerRepository = {
            save: vi.fn(),
            findByCpfCnpj: vi.fn(),
        };
        const useCase = new FindCustomerByDocument(repository);

        await expect(useCase.execute({ document: '123' })).rejects.toThrow(
            InvalidDocumentException,
        );
        expect(repository.findByCpfCnpj).not.toHaveBeenCalled();
    });
});
