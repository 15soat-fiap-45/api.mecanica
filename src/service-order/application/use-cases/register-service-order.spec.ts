import { describe, expect, it, vi } from 'vitest';
import type { ServiceOrderRepository } from '../../domain/service-order/service-order.repository.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import { RegisterServiceOrder } from './register-service-order.js';

describe('RegisterServiceOrder Use Case', () => {
    const validInput = {
        id: 'os-1',
        description: 'Troca de pastilhas e fluido de freio',
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
        const useCase = new RegisterServiceOrder(repository, eventBus);

        const result = await useCase.execute(validInput);

        expect(result).toEqual({
            id: 'os-1',
            description: 'Troca de pastilhas e fluido de freio',
            status: 'PENDING',
        });
        expect(repository.save).toHaveBeenCalledTimes(1);
        expect(eventBus.publish).toHaveBeenCalledTimes(1);
        expect(eventBus.publish).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    eventName: 'service-order.registered',
                    aggregateId: 'os-1',
                }),
            ]),
        );
    });

    it('should generate an id when none is provided', async () => {
        const repository = makeRepository();
        const useCase = new RegisterServiceOrder(repository);

        const result = await useCase.execute({ description: 'Alinhamento' });

        expect(result.id).toBeTruthy();
        expect(result.status).toBe('PENDING');
        expect(repository.save).toHaveBeenCalledTimes(1);
    });
});
