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

    it('finds a customer by CPF/CNPJ', async () => {
        const app = Fastify();
        const useCases = makeUseCases();
        registerRegistryRoutes(app, useCases);

        const response = await app.inject({
            method: 'GET',
            url: '/customers/52998224725',
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            cpfCnpj: '52998224725',
        });
        expect(useCases.findCustomerByDocument.execute).toHaveBeenCalledWith({
            document: '52998224725',
        });
        await app.close();
    });

    it('registers a vehicle and returns 201', async () => {
        const app = Fastify();
        const useCases = makeUseCases();
        registerRegistryRoutes(app, useCases);

        const response = await app.inject({
            method: 'POST',
            url: '/vehicles',
            payload: {
                customerId: '52998224725',
                model: 'Civic',
                year: 2022,
                brand: 'Honda',
                color: 'Black',
                plate: 'ABC-1234',
            },
        });

        expect(response.statusCode).toBe(201);
        expect(useCases.registerVehicle.execute).toHaveBeenCalledWith(
            expect.objectContaining({
                customerId: '52998224725',
                plate: 'ABC-1234',
            }),
        );
        await app.close();
    });

    it('finds a vehicle by plate', async () => {
        const app = Fastify();
        const useCases = makeUseCases();
        registerRegistryRoutes(app, useCases);

        const response = await app.inject({
            method: 'GET',
            url: '/vehicles/ABC-1234',
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            plate: 'ABC1234',
            customerId: '52998224725',
        });
        expect(useCases.findVehicleByPlate.execute).toHaveBeenCalledWith({
            plate: 'ABC-1234',
        });
        await app.close();
    });

    it('rejects an invalid vehicle payload with 400', async () => {
        const app = Fastify();
        registerRegistryRoutes(app, makeUseCases());

        const response = await app.inject({
            method: 'POST',
            url: '/vehicles',
            payload: {
                customerId: 'invalid',
                model: '',
                year: 1800,
                brand: 'Honda',
                color: 'Black',
                plate: 'invalid',
            },
        });

        expect(response.statusCode).toBe(400);
        await app.close();
    });
});
