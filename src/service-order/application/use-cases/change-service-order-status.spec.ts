import { expect, it, vi } from 'vitest';
import { ServiceOrder } from '../../domain/service-order/service-order.js';
import { ChangeServiceOrderStatus } from './change-service-order-status.js';

it('moves an approved order through execution, completion and delivery, publishing only after saving', async () => {
    const order = ServiceOrder.create({ id: 'os-1', description: 'Freios' });
    order.approve();
    const save = vi.fn(async () => {});
    const publish = vi.fn(async () => {
        expect(save).toHaveBeenCalledTimes(publish.mock.calls.length);
    });
    const orders = { findById: vi.fn(async () => order), save };
    const bus = { publish, subscribe: vi.fn() };
    expect(
        await new ChangeServiceOrderStatus(
            orders,
            bus,
            'startExecution',
        ).execute({ serviceOrderId: 'os-1' }),
    ).toEqual({ serviceOrderId: 'os-1', status: 'IN_PROGRESS' });
    expect(
        await new ChangeServiceOrderStatus(orders, bus, 'finish').execute({
            serviceOrderId: 'os-1',
        }),
    ).toEqual({ serviceOrderId: 'os-1', status: 'COMPLETED' });
    expect(publish).toHaveBeenCalledWith([
        expect.objectContaining({ eventName: 'service-order.finished' }),
    ]);
    expect(
        await new ChangeServiceOrderStatus(orders, bus, 'deliver').execute({
            serviceOrderId: 'os-1',
        }),
    ).toEqual({ serviceOrderId: 'os-1', status: 'DELIVERED' });
});

it('does not change a missing or invalid order', async () => {
    const orders = { findById: vi.fn(async () => null), save: vi.fn() };
    const bus = { publish: vi.fn(), subscribe: vi.fn() };
    await expect(
        new ChangeServiceOrderStatus(orders, bus, 'finish').execute({
            serviceOrderId: 'missing',
        }),
    ).rejects.toThrow('not found');
    expect(orders.save).not.toHaveBeenCalled();
});
