import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import type { RegistryUseCases } from '../../composition-root.js';
import { registerRegistryRoutes } from './registry-routes.js';

function makeUseCases(): RegistryUseCases {
    return {
        registerCustomer: {
            execute: vi.fn().mockResolvedValue({
                cpfCnpj: '52998224725',
                name: 'John Doe',
                email: 'john.doe@example.com',
                tel: '11987654321',
            }),
        },
        findCustomerByDocument: {
            execute: vi.fn().mockResolvedValue({
                cpfCnpj: '52998224725',
                name: 'John Doe',
                email: 'john.doe@example.com',
                tel: '11987654321',
            }),
        },
        registerVehicle: {
            execute: vi.fn().mockResolvedValue({
                id: 'vehicle-id',
                customerId: '52998224725',
                model: 'Civic',
                year: 2022,
                brand: 'Honda',
                color: 'Black',
                plate: 'ABC1234',
            }),
        },
        findVehicleByPlate: {
            execute: vi.fn().mockResolvedValue({
                id: 'vehicle-id',
                customerId: '52998224725',
                model: 'Civic',
                year: 2022,
                brand: 'Honda',
                color: 'Black',
                plate: 'ABC1234',
            }),
        },
    };
}

describe('Registry HTTP routes', () => {
    it('registers a customer and returns 201', async () => {
        const app = Fastify();
        const useCases = makeUseCases();
        registerRegistryRoutes(app, useCases);

        const response = await app.inject({
            method: 'POST',
            url: '/customers',
            payload: {
                cpfCnpj: '52998224725',
                name: 'John Doe',
                email: 'john.doe@example.com',
                tel: '11987654321',
            },
        });

        expect(response.statusCode).toBe(201);
        expect(useCases.registerCustomer.execute).toHaveBeenCalledWith(
            expect.objectContaining({ cpfCnpj: '52998224725' }),
        );
        await app.close();
    });

    it('rejects an invalid customer payload with 400', async () => {
        const app = Fastify();
        registerRegistryRoutes(app, makeUseCases());

        const response = await app.inject({
            method: 'POST',
            url: '/customers',
            payload: {
                cpfCnpj: 'invalid',
                name: '',
                email: 'invalid',
                tel: '1',
            },
        });

        expect(response.statusCode).toBe(400);
        await app.close();
    });
});
