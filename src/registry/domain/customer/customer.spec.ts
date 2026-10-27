import { describe, expect, it } from 'vitest';
import { CustomerId } from './customer-id.js';
import { Customer } from './customer.js';
import { CpfCnpj } from './value-objects/cpf-cnpj.js';
import { Email } from '../../../shared/domain/email.js';
import { Telephone } from './value-objects/telephone.js';

describe('Customer Aggregate Root', () => {
    const cpf = CpfCnpj.create('52998224725');
    const email = Email.create('john.doe@example.com');
    const tel = Telephone.create('11987654321');

    it('should create Customer with CustomerId identity and version 0', () => {
        const customer = new Customer(cpf, 'John Doe', email, tel);

        expect(customer.id.equals(cpf)).toBe(true);
        expect(customer.cpfCnpj.equals(cpf)).toBe(true);
        expect(customer.name).toBe('John Doe');
        expect(customer.version).toBe(0);
    });

    it('should record CustomerRegistered event on Customer.register()', () => {
        const customerId = CustomerId.create('52998224725');
        const customer = Customer.register({
            cpfCnpj: customerId,
            name: 'John Doe',
            email,
            tel,
        });

        const events = customer.pullEvents();
        expect(events).toHaveLength(1);
        expect(events[0]?.eventName).toBe('registry.customer-registered');
        expect(events[0]?.aggregateId).toBe('52998224725');
        expect(customer.pullEvents()).toHaveLength(0);
    });

    it('should compare Customers by identity using AggregateRoot.equals()', () => {
        const customer1 = new Customer(cpf, 'John Doe', email, tel);
        const customer2 = new Customer(cpf, 'John Updated', email, tel);
        const otherCpf = CpfCnpj.create('11.222.333/0001-81');
        const customer3 = new Customer(otherCpf, 'Other Person', email, tel);

        expect(customer1.equals(customer2)).toBe(true);
        expect(customer1.equals(customer3)).toBe(false);
    });
});
