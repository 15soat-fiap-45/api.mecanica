import { describe, expect, it, vi } from 'vitest';
import type { ServiceOrderRepository } from '../../domain/service-order/service-order.repository.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import { RegisterServiceOrder } from './register-service-order.js';
import { InMemoryServiceRepository } from '../../infra/persistence/in-memory-catalog-repositories.js';
import { Service } from '../../domain/catalog/service.js';

describe('RegisterServiceOrder Use Case', () => {
    const validInput = {
        description: 'Troca de pastilhas e fluido de freio',
        vehicleId: 'vehicle-1',
    };
    const contacts = {
        findByVehicleId: vi.fn(async () => ({
            name: 'Ana',
            email: 'ana@example.com',
            customerDocument: '52998224725',
        })),
    };

    const services = new InMemoryServiceRepository();
    void services.save(
        Service.create({
            id: 'svc-oil',
            name: 'Troca de óleo',
            priceCents: 12000,
            serviceTypeId: 'type-1',
        }),
    );

    const makeRepository = (): ServiceOrderRepository => ({
        save: vi.fn().mockResolvedValue(undefined),
        findById: vi.fn().mockResolvedValue(null),
    });

    const makeEventBus = (): EventBus => ({
        publish: vi.fn().mockResolvedValue(undefined),
        subscribe: vi.fn(),
    });

    it('should register a new service order successfully and publish domain event', async () => {
        const repository = makeRepository();
        const eventBus = makeEventBus();
        const useCase = new RegisterServiceOrder(
            repository,
            contacts,
            services,
            eventBus,
        );

        const result = await useCase.execute(validInput);

        expect(result.id).toBeTruthy();
        expect(result.description).toBe('Troca de pastilhas e fluido de freio');
        expect(result.status).toBe('PENDING');
        expect(result.vehicleId).toBe('vehicle-1');
        expect(result.services).toEqual([]);
        expect(result.totalCents).toBe(0);
        expect(repository.save).toHaveBeenCalledTimes(1);
        expect(eventBus.publish).toHaveBeenCalledTimes(1);
        expect(eventBus.publish).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    eventName: 'service-order.registered',
                    aggregateId: result.id,
                }),
            ]),
        );
    });

    it('should include the requested catalog services with their current price', async () => {
        const repository = makeRepository();
        const useCase = new RegisterServiceOrder(
            repository,
            contacts,
            services,
        );

        const result = await useCase.execute({
            ...validInput,
            serviceIds: ['svc-oil', 'svc-oil'],
        });

        expect(result.services).toEqual([
            { serviceId: 'svc-oil', name: 'Troca de óleo', priceCents: 12000 },
        ]);
        expect(result.totalCents).toBe(12000);
        expect(repository.save).toHaveBeenCalledTimes(1);
    });

    it('does not register an order with an unknown catalog service', async () => {
        const repository = makeRepository();
        const useCase = new RegisterServiceOrder(
            repository,
            contacts,
            services,
        );

        await expect(
            useCase.execute({ ...validInput, serviceIds: ['missing'] }),
        ).rejects.toThrow('Service not found');
        expect(repository.save).not.toHaveBeenCalled();
    });

    it('should always generate the id (a caller-chosen id could overwrite an existing order on retry)', async () => {
        const repository = makeRepository();
        const useCase = new RegisterServiceOrder(
            repository,
            contacts,
            services,
        );

        const first = await useCase.execute(validInput);
        const second = await useCase.execute(validInput);

        expect(first.id).toBeTruthy();
        expect(second.id).toBeTruthy();
        expect(first.id).not.toBe(second.id);
        expect(repository.save).toHaveBeenCalledTimes(2);
    });

    it('does not register an order for an unknown vehicle', async () => {
        const repository = makeRepository();
        const useCase = new RegisterServiceOrder(
            repository,
            { findByVehicleId: vi.fn(async () => null) },
            services,
        );
        await expect(useCase.execute(validInput)).rejects.toThrow(
            'Vehicle not found',
        );
        expect(repository.save).not.toHaveBeenCalled();
    });
});
