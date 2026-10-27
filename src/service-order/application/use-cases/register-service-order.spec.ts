import { describe, expect, it, vi } from 'vitest';
import type { ServiceOrderRepository } from '../../domain/service-order/service-order.repository.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import { RegisterServiceOrder } from './register-service-order.js';

describe('RegisterServiceOrder Use Case', () => {
    const validInput = {
        description: 'Troca de pastilhas e fluido de freio',
        vehicleId: 'vehicle-1',
    };
    const contacts = {
        findByVehicleId: vi.fn(async () => ({
            name: 'Ana',
            email: 'ana@example.com',
        })),
    };

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
            eventBus,
        );

        const result = await useCase.execute(validInput);

        expect(result.id).toBeTruthy();
        expect(result.description).toBe('Troca de pastilhas e fluido de freio');
        expect(result.status).toBe('PENDING');
        expect(result.vehicleId).toBe('vehicle-1');
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

    it('should always generate the id (a caller-chosen id could overwrite an existing order on retry)', async () => {
        const repository = makeRepository();
        const useCase = new RegisterServiceOrder(repository, contacts);

        const first = await useCase.execute(validInput);
        const second = await useCase.execute(validInput);

        expect(first.id).toBeTruthy();
        expect(second.id).toBeTruthy();
        expect(first.id).not.toBe(second.id);
        expect(repository.save).toHaveBeenCalledTimes(2);
    });

    it('does not register an order for an unknown vehicle', async () => {
        const repository = makeRepository();
        const useCase = new RegisterServiceOrder(repository, {
            findByVehicleId: vi.fn(async () => null),
        });
        await expect(useCase.execute(validInput)).rejects.toThrow(
            'Vehicle not found',
        );
        expect(repository.save).not.toHaveBeenCalled();
    });
});
