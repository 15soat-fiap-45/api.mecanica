import type {
    FastifyInstance,
    FastifyReply,
    FastifyRequest,
    HookHandlerDoneFunction,
} from 'fastify';
import {
    serializerCompiler,
    validatorCompiler,
    type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { RegistryUseCases } from '../../composition-root.js';

const registryPermission = 'CLIENTE_EDITAR' as const;

const customerBodySchema = z
    .object({
        cpfCnpj: z.string().min(1).max(18),
        name: z.string().trim().min(1).max(100),
        email: z.email().max(100),
        tel: z.string().min(10).max(20),
    })
    .meta({
        examples: [
            {
                cpfCnpj: '52998224725',
                name: 'João da Silva',
                email: 'joao.silva@example.com',
                tel: '11987654321',
            },
        ],
    });

const customerResponseSchema = z
    .object({
        cpfCnpj: z.string(),
        name: z.string(),
        email: z.string(),
        tel: z.string(),
    })
    .meta({
        examples: [
            {
                cpfCnpj: '52998224725',
                name: 'João da Silva',
                email: 'joao.silva@example.com',
                tel: '11987654321',
            },
        ],
    });

const vehicleBodySchema = z
    .object({
        id: z.string().min(1).max(36).optional(),
        customerId: z.string().min(1).max(18),
        model: z.string().trim().min(1).max(30),
        year: z.number().int().min(1886).max(2100),
        brand: z.string().trim().min(1).max(16),
        color: z.string().trim().min(1).max(15),
        plate: z.string().min(1).max(8),
    })
    .meta({
        examples: [
            {
                customerId: '52998224725',
                model: 'Civic',
                year: 2022,
                brand: 'Honda',
                color: 'Preto',
                plate: 'ABC-1234',
            },
        ],
    });

const vehicleResponseSchema = z
    .object({
        id: z.string(),
        customerId: z.string(),
        model: z.string(),
        year: z.number(),
        brand: z.string(),
        color: z.string(),
        plate: z.string(),
    })
    .meta({
        examples: [
            {
                id: 'vehicle-id',
                customerId: '52998224725',
                model: 'Civic',
                year: 2022,
                brand: 'Honda',
                color: 'Preto',
                plate: 'ABC1234',
            },
        ],
    });

const customerUpdateBodySchema = customerBodySchema
    .omit({ cpfCnpj: true })
    .meta({
        examples: [
            {
                name: 'Maria Oliveira',
                email: 'maria.oliveira@example.com',
                tel: '11999998888',
            },
        ],
    });

const vehicleUpdateBodySchema = vehicleBodySchema
    .omit({
        id: true,
        customerId: true,
    })
    .meta({
        examples: [
            {
                model: 'Civic Touring',
                year: 2023,
                brand: 'Honda',
                color: 'Prata',
                plate: 'ABC-1234',
            },
        ],
    });

const documentParamsSchema = z.object({
    cpfCnpj: z.string().min(1).max(18),
});

const plateParamsSchema = z.object({
    plate: z.string().min(1).max(8),
});

const vehicleIdParamsSchema = z.object({
    id: z.string().min(1).max(36),
});

export function registerRegistryRoutes(
    app: FastifyInstance,
    useCases: RegistryUseCases,
): void {
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    const typedApp = app.withTypeProvider<ZodTypeProvider>();
    const requireAuth = (
        request: FastifyRequest,
        reply: FastifyReply,
        done: HookHandlerDoneFunction,
    ) => {
        const resolver = useCases.actorResolver;
        if (!resolver) {
            reply.code(401).send({
                error: 'UnauthorizedError',
                message: 'Authentication required.',
            });
            return;
        }

        const authenticate = resolver.authenticate
            ? resolver.authenticate(request.headers.authorization)
            : resolver
                  .resolve(request.headers.authorization)
                  .then((id) => (id ? { id, can: () => true } : null));
        authenticate.then((actor) => {
            if (!actor) {
                reply.code(401).send({
                    error: 'UnauthorizedError',
                    message: 'Authentication required.',
                });
                return;
            }
            if (!actor.can(registryPermission)) {
                reply.code(403).send({
                    error: 'ForbiddenError',
                    message: 'Insufficient permissions.',
                });
                return;
            }
            done();
        }, done);
    };

    typedApp.post(
        '/customers',
        {
            preValidation: requireAuth,
            schema: {
                tags: ['Registry'],
                body: customerBodySchema,
                response: { 201: customerResponseSchema },
            },
        },
        async (request, reply) => {
            const customer = await useCases.registerCustomer.execute(
                request.body,
            );
            return reply.code(201).send(customer);
        },
    );

    typedApp.get(
        '/customers/:cpfCnpj',
        {
            preValidation: requireAuth,
            schema: {
                tags: ['Registry'],
                params: documentParamsSchema,
                response: { 200: customerResponseSchema },
            },
        },
        async (request) =>
            useCases.findCustomerByDocument.execute({
                document: request.params.cpfCnpj,
            }),
    );

    typedApp.patch(
        '/customers/:cpfCnpj',
        {
            preValidation: requireAuth,
            schema: {
                tags: ['Registry'],
                params: documentParamsSchema,
                body: customerUpdateBodySchema,
                response: { 200: customerResponseSchema },
            },
        },
        async (request) =>
            useCases.updateCustomer.execute({
                ...request.body,
                cpfCnpj: request.params.cpfCnpj,
            }),
    );

    typedApp.delete(
        '/customers/:cpfCnpj',
        {
            preValidation: requireAuth,
            schema: {
                tags: ['Registry'],
                params: documentParamsSchema,
            },
        },
        async (request, reply) => {
            await useCases.deleteCustomer.execute(request.params);
            return reply.code(204).send();
        },
    );

    typedApp.post(
        '/vehicles',
        {
            preValidation: requireAuth,
            schema: {
                tags: ['Registry'],
                body: vehicleBodySchema,
                response: { 201: vehicleResponseSchema },
            },
        },
        async (request, reply) => {
            const vehicle = await useCases.registerVehicle.execute(
                request.body,
            );
            return reply.code(201).send(vehicle);
        },
    );

    typedApp.get(
        '/vehicles/:plate',
        {
            preValidation: requireAuth,
            schema: {
                tags: ['Registry'],
                params: plateParamsSchema,
                response: { 200: vehicleResponseSchema },
            },
        },
        async (request) =>
            useCases.findVehicleByPlate.execute({
                plate: request.params.plate,
            }),
    );

    typedApp.patch(
        '/vehicles/:id',
        {
            preValidation: requireAuth,
            schema: {
                tags: ['Registry'],
                params: vehicleIdParamsSchema,
                body: vehicleUpdateBodySchema,
                response: { 200: vehicleResponseSchema },
            },
        },
        async (request) =>
            useCases.updateVehicle.execute({
                ...request.body,
                id: request.params.id,
            }),
    );

    typedApp.delete(
        '/vehicles/:id',
        {
            preValidation: requireAuth,
            schema: {
                tags: ['Registry'],
                params: vehicleIdParamsSchema,
            },
        },
        async (request, reply) => {
            await useCases.deleteVehicle.execute(request.params);
            return reply.code(204).send();
        },
    );
}
