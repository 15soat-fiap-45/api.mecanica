import { describe, expect, it, vi } from 'vitest';
import { ServiceOrder } from '../../domain/service-order/service-order.js';
import type { ServiceOrderRepository } from '../../domain/service-order/service-order.repository.js';
import { InvalidServiceOrderStatusException } from '../../domain/service-order/value-objects/service-order-status.js';
import { ListServiceOrders } from './list-service-orders.js';

describe('ListServiceOrders', () => {
    const order = ServiceOrder.create({
        id: 'os-1',
        description: 'Freios',
        vehicleId: 'vehicle-1',
    });
    order.addService({ serviceId: 's-1', name: 'Troca', priceCents: 18000 });
    order.addSupply('PAST-01', 2, { unitPriceCents: 8500 });

    const repositoryWith = (
        list?: ServiceOrderRepository['list'],
    ): ServiceOrderRepository => ({
        save: vi.fn(),
        findById: vi.fn(),
        ...(list ? { list } : {}),
    });

    it('maps each order to a summary with its total and opening date', async () => {
        const openedAt = new Date('2026-10-28T12:00:00.000Z');
        const list = vi.fn(async () => ({
            items: [{ order, openedAt }],
            total: 7,
        }));
        const result = await new ListServiceOrders(
            repositoryWith(list),
        ).execute({
            statuses: ['in_progress', 'PENDING', 'pending'],
            vehicleId: 'vehicle-1',
            limit: 5,
            offset: 5,
        });

        expect(list).toHaveBeenCalledWith({
            statuses: ['IN_PROGRESS', 'PENDING'],
            vehicleId: 'vehicle-1',
            limit: 5,
            offset: 5,
        });
        expect(result).toEqual({
            items: [
                {
                    id: 'os-1',
                    vehicleId: 'vehicle-1',
                    description: 'Freios',
                    status: 'PENDING',
                    openedAt: '2026-10-28T12:00:00.000Z',
                    totalCents: 35000,
                },
            ],
            total: 7,
            limit: 5,
            offset: 5,
        });
    });

    it('applies default and bounded pagination without status filter', async () => {
        const list = vi.fn(async () => ({
            items: [{ order, openedAt: null }],
            total: 1,
        }));
        const useCase = new ListServiceOrders(repositoryWith(list));

        const page = await useCase.execute({});
        expect(list).toHaveBeenLastCalledWith({
            statuses: undefined,
            vehicleId: undefined,
            limit: 20,
            offset: 0,
        });
        expect(page.items[0]?.openedAt).toBeNull();

        await useCase.execute({ limit: 1000, offset: -3 });
        expect(list).toHaveBeenLastCalledWith(
            expect.objectContaining({ limit: 100, offset: 0 }),
        );
        await useCase.execute({ limit: 0 });
        expect(list).toHaveBeenLastCalledWith(
            expect.objectContaining({ limit: 1 }),
        );
    });

    it('rejects unknown statuses and returns an empty page when listing is unsupported', async () => {
        const useCase = new ListServiceOrders(repositoryWith());
        await expect(useCase.execute({ statuses: ['DONE'] })).rejects.toThrow(
            InvalidServiceOrderStatusException,
        );
        await expect(useCase.execute({})).resolves.toEqual({
            items: [],
            total: 0,
            limit: 20,
            offset: 0,
        });
    });
});
