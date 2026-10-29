import { describe, expect, it, vi } from 'vitest';
import type { CustomerRepository } from '../../domain/customer/customer.repository.js';
import type { Customer } from '../../domain/customer/customer.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import {
    CustomerAlreadyExistsError,
    RegisterCustomer,
} from './register-customer.js';
import { InvalidDocumentException } from '../../domain/customer/exceptions/InvalidDocumentException.js';

describe('RegisterCustomer Use Case', () => {
    const validCustomerInput = {
        cpfCnpj: '52998224725',
        name: 'John Doe',
        email: 'john.doe@example.com',
        tel: '11987654321',
    };

    const makeRepository = (
        existing: Customer | null = null,
    ): CustomerRepository => ({
        save: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        findByCpfCnpj: vi.fn().mockResolvedValue(existing),
    });

    const makeEventBus = (): EventBus => ({
        publish: vi.fn().mockResolvedValue(undefined),
        subscribe: vi.fn(),
    });

    it('should register a new customer successfully and save to repository', async () => {
        const repository = makeRepository();
        const eventBus = makeEventBus();
        const useCase = new RegisterCustomer(repository, eventBus);

        const result = await useCase.execute(validCustomerInput);

        expect(result).toEqual({
            cpfCnpj: '52998224725',
            name: 'John Doe',
            email: 'john.doe@example.com',
            tel: '11987654321',
        });
        expect(repository.save).toHaveBeenCalledTimes(1);
        expect(eventBus.publish).toHaveBeenCalledTimes(1);
        expect(eventBus.publish).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    eventName: 'registry.customer-registered',
                    aggregateId: '52998224725',
                }),
            ]),
        );
    });

    it('should throw CustomerAlreadyExistsError when customer already exists', async () => {
        const repository = makeRepository({} as Customer);
        const useCase = new RegisterCustomer(repository);

        await expect(useCase.execute(validCustomerInput)).rejects.toThrow(
            CustomerAlreadyExistsError,
        );
        expect(repository.save).not.toHaveBeenCalled();
    });

    it('should throw InvalidDocumentException when document is invalid', async () => {
        const repository = makeRepository();
        const useCase = new RegisterCustomer(repository);

        await expect(
            useCase.execute({
                ...validCustomerInput,
                cpfCnpj: '00000000000',
            }),
        ).rejects.toThrow(InvalidDocumentException);
        expect(repository.save).not.toHaveBeenCalled();
    });

    it('should not publish the event when persistence fails', async () => {
        const repository = makeRepository();
        const save = vi.mocked(repository.save);
        save.mockRejectedValueOnce(new Error('database unavailable'));
        const eventBus = makeEventBus();
        const useCase = new RegisterCustomer(repository, eventBus);

        await expect(useCase.execute(validCustomerInput)).rejects.toThrow(
            'database unavailable',
        );

        expect(eventBus.publish).not.toHaveBeenCalled();
    });

    it('should save before publishing the event', async () => {
        const repository = makeRepository();
        const eventBus = makeEventBus();
        const order: string[] = [];
        vi.mocked(repository.save).mockImplementationOnce(async () => {
            order.push('save');
        });
        vi.mocked(eventBus.publish).mockImplementationOnce(async () => {
            order.push('publish');
        });
        const useCase = new RegisterCustomer(repository, eventBus);

        await useCase.execute(validCustomerInput);

        expect(order).toEqual(['save', 'publish']);
    });
});
