import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';
import { describe, expect, it, vi } from 'vitest';
import type { RegistryUseCases } from '../../composition-root.js';
import { registerRegistryRoutes } from './registry-routes.js';

interface SwaggerOperation {
    tags?: string[];
    requestBody?: {
        content?: {
            'application/json'?: {
                schema?: Record<string, unknown>;
                example?: Record<string, unknown>;
            };
        };
    };
    responses?: Record<
        string,
        {
            content?: {
                'application/json'?: {
                    schema?: Record<string, unknown>;
                    example?: Record<string, unknown>;
                };
            };
        }
    >;
}

function makeUseCases(): RegistryUseCases {
    return {
        actorResolver: {
            authenticate: vi.fn().mockResolvedValue({
                id: 'atendente@example.com',
                can: () => true,
            }),
            resolve: vi.fn().mockResolvedValue('atendente@example.com'),
        },
        registerCustomer: {
            execute: vi.fn().mockResolvedValue({
                cpfCnpj: '52998224725',
                name: 'João da Silva',
                email: 'joao.silva@example.com',
                tel: '11987654321',
            }),
        },
        updateCustomer: {
            execute: vi.fn().mockResolvedValue({
                cpfCnpj: '52998224725',
                name: 'Maria Oliveira',
                email: 'maria.oliveira@example.com',
                tel: '11999998888',
            }),
        },
        deleteCustomer: { execute: vi.fn().mockResolvedValue(undefined) },
        findCustomerByDocument: {
            execute: vi.fn().mockResolvedValue({
                cpfCnpj: '52998224725',
                name: 'João da Silva',
                email: 'joao.silva@example.com',
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
                color: 'Preto',
                plate: 'ABC1234',
            }),
        },
        updateVehicle: {
            execute: vi.fn().mockResolvedValue({
                id: 'vehicle-id',
                customerId: '52998224725',
                model: 'Civic Touring',
                year: 2023,
                brand: 'Honda',
                color: 'Prata',
                plate: 'ABC1234',
            }),
        },
        deleteVehicle: { execute: vi.fn().mockResolvedValue(undefined) },
        findVehicleByPlate: {
            execute: vi.fn().mockResolvedValue({
                id: 'vehicle-id',
                customerId: '52998224725',
                model: 'Civic',
                year: 2022,
                brand: 'Honda',
                color: 'Preto',
                plate: 'ABC1234',
            }),
        },
    };
}

describe('Registry HTTP routes', () => {
    it('requires authentication on registry routes', async () => {
        const app = Fastify();
        registerRegistryRoutes(app, {
            ...makeUseCases(),
            actorResolver: undefined,
        });

        const response = await app.inject({
            method: 'GET',
            url: '/customers/52998224725',
        });

        expect(response.statusCode).toBe(401);
        await app.close();
    });

    it('rejects an authenticated user without CLIENTE_EDITAR permission', async () => {
        const app = Fastify();
        const useCases = makeUseCases();
        useCases.actorResolver!.authenticate = vi.fn().mockResolvedValue({
            id: 'mecanico@example.com',
            can: () => false,
        });
        registerRegistryRoutes(app, useCases);

        const response = await app.inject({
            method: 'GET',
            url: '/customers/52998224725',
            headers: { authorization: 'Bearer token' },
        });

        expect(response.statusCode).toBe(403);
        await app.close();
    });

    it('registers a customer and returns 201', async () => {
        const app = Fastify();
        const useCases = makeUseCases();
        registerRegistryRoutes(app, useCases);

        const response = await app.inject({
            method: 'POST',
            url: '/customers',
            payload: {
                cpfCnpj: '52998224725',
                name: 'João da Silva',
                email: 'joao.silva@example.com',
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

    it('updates and deletes a customer', async () => {
        const app = Fastify();
        const useCases = makeUseCases();
        registerRegistryRoutes(app, useCases);

        const updated = await app.inject({
            method: 'PATCH',
            url: '/customers/52998224725',
            payload: {
                name: 'Maria Oliveira',
                email: 'maria.oliveira@example.com',
                tel: '11999998888',
            },
        });
        const deleted = await app.inject({
            method: 'DELETE',
            url: '/customers/52998224725',
        });

        expect(updated.statusCode).toBe(200);
        expect(deleted.statusCode).toBe(204);
        expect(useCases.updateCustomer.execute).toHaveBeenCalledWith(
            expect.objectContaining({ cpfCnpj: '52998224725' }),
        );
        expect(useCases.deleteCustomer.execute).toHaveBeenCalledWith({
            cpfCnpj: '52998224725',
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
                color: 'Preto',
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

    it('updates and deletes a vehicle by id', async () => {
        const app = Fastify();
        const useCases = makeUseCases();
        registerRegistryRoutes(app, useCases);

        const updated = await app.inject({
            method: 'PATCH',
            url: '/vehicles/vehicle-id',
            payload: {
                model: 'Civic Touring',
                year: 2023,
                brand: 'Honda',
                color: 'Prata',
                plate: 'ABC-1234',
            },
        });
        const deleted = await app.inject({
            method: 'DELETE',
            url: '/vehicles/vehicle-id',
        });

        expect(updated.statusCode).toBe(200);
        expect(deleted.statusCode).toBe(204);
        expect(useCases.updateVehicle.execute).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'vehicle-id' }),
        );
        expect(useCases.deleteVehicle.execute).toHaveBeenCalledWith({
            id: 'vehicle-id',
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
                color: 'Preto',
                plate: 'invalid',
            },
        });

        expect(response.statusCode).toBe(400);
        await app.close();
    });

    it('documents registry request and response examples in Swagger', async () => {
        const app = Fastify();
        await app.register(swagger, {
            openapi: {
                info: { title: 'Registry test', version: '1.0.0' },
            },
            transform: jsonSchemaTransform,
        });
        registerRegistryRoutes(app, makeUseCases());
        await app.ready();

        const document = app.swagger() as {
            paths?: Record<string, { post?: SwaggerOperation }>;
        };
        const customerPost = document.paths?.['/customers']?.post;
        const vehiclePost = document.paths?.['/vehicles']?.post;

        expect(customerPost?.tags).toContain('Registry');
        expect(
            customerPost?.requestBody?.content?.['application/json']?.example,
        ).toMatchObject({
            email: 'joao.silva@example.com',
        });
        expect(
            customerPost?.responses?.['201']?.content?.['application/json']
                ?.example,
        ).toMatchObject({
            cpfCnpj: '52998224725',
        });
        expect(
            vehiclePost?.requestBody?.content?.['application/json']?.example,
        ).toMatchObject({
            model: 'Civic',
        });

        await app.close();
    });
});
