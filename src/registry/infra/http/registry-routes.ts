import type { FastifyInstance } from 'fastify';
import {
    serializerCompiler,
    validatorCompiler,
    type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { RegistryUseCases } from '../../composition-root.js';

const customerBodySchema = z.object({
    cpfCnpj: z.string().min(1).max(18),
    name: z.string().trim().min(1).max(100),
    email: z.email().max(100),
    tel: z.string().min(10).max(20),
});

const customerResponseSchema = z.object({
    cpfCnpj: z.string(),
    name: z.string(),
    email: z.string(),
    tel: z.string(),
});

const vehicleBodySchema = z.object({
    id: z.string().min(1).max(36).optional(),
    customerId: z.string().min(1).max(18),
    model: z.string().trim().min(1).max(30),
    year: z.number().int().min(1886).max(2100),
    brand: z.string().trim().min(1).max(16),
    color: z.string().trim().min(1).max(15),
    plate: z.string().min(1).max(8),
});

const vehicleResponseSchema = z.object({
    id: z.string(),
    customerId: z.string(),
    model: z.string(),
    year: z.number(),
    brand: z.string(),
    color: z.string(),
    plate: z.string(),
});

const documentParamsSchema = z.object({
    cpfCnpj: z.string().min(1).max(18),
});

const plateParamsSchema = z.object({
    plate: z.string().min(1).max(8),
});

export function registerRegistryRoutes(
    app: FastifyInstance,
    useCases: RegistryUseCases,
): void {
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.post(
        '/customers',
        {
            schema: {
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
            schema: {
                params: documentParamsSchema,
                response: { 200: customerResponseSchema },
            },
        },
        async (request) =>
            useCases.findCustomerByDocument.execute({
                document: request.params.cpfCnpj,
            }),
    );

    typedApp.post(
        '/vehicles',
        {
            schema: {
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
            schema: {
                params: plateParamsSchema,
                response: { 200: vehicleResponseSchema },
            },
        },
        async (request) =>
            useCases.findVehicleByPlate.execute({
                plate: request.params.plate,
            }),
    );
}
