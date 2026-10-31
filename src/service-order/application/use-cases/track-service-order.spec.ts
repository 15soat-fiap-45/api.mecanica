import { describe, expect, it, vi } from 'vitest';
import { ServiceOrder } from '../../domain/service-order/service-order.js';
import type { ServiceOrderRepository } from '../../domain/service-order/service-order.repository.js';
import { ServiceOrderNotFoundError } from './add-supply-to-service-order.js';
import { TrackServiceOrder } from './track-service-order.js';

describe('TrackServiceOrder Use Case', () => {
    const order = ServiceOrder.create({
        id: 'os-1',
        description: 'Troca de pastilhas',
        vehicleId: 'vehicle-1',
    });
    const repository: ServiceOrderRepository = {
        save: vi.fn(),
        findById: vi.fn(async (id) => (String(id) === 'os-1' ? order : null)),
        findStatusHistory: vi.fn(async () => [
            {
                status: 'PENDING' as const,
                valueCents: null,
                changedBy: 'atendente-1',
                recordedAt: new Date('2026-10-28T12:00:00.000Z'),
            },
        ]),
    };
    const contacts = {
        findByVehicleId: vi.fn(async (id: string) =>
            id === 'vehicle-1'
                ? {
                      name: 'Ana',
                      email: 'ana@example.com',
                      customerDocument: '52998224725',
                  }
                : null,
        ),
    };
    const useCase = new TrackServiceOrder(repository, contacts);

    it('returns status and history without the actor when the document matches, ignoring the mask', async () => {
        await expect(
            useCase.execute({
                serviceOrderId: 'os-1',
                document: '529.982.247-25',
            }),
        ).resolves.toEqual({
            serviceOrderId: 'os-1',
            description: 'Troca de pastilhas',
            status: 'PENDING',
            valueCents: null,
            history: [
                { status: 'PENDING', recordedAt: '2026-10-28T12:00:00.000Z' },
            ],
        });
    });

    it.each([
        ['another customer document', 'os-1', '11144477735'],
        ['an empty document', 'os-1', '...'],
        ['a missing order', 'missing', '52998224725'],
    ])('answers not found for %s', async (_case, serviceOrderId, document) => {
        await expect(
            useCase.execute({ serviceOrderId, document }),
        ).rejects.toBeInstanceOf(ServiceOrderNotFoundError);
    });

    it('answers not found when the order has no vehicle owner', async () => {
        const orphan = new TrackServiceOrder(
            { ...repository, findById: vi.fn(async () => order) },
            { findByVehicleId: vi.fn(async () => null) },
        );
        await expect(
            orphan.execute({ serviceOrderId: 'os-1', document: '52998224725' }),
        ).rejects.toBeInstanceOf(ServiceOrderNotFoundError);
    });
});
