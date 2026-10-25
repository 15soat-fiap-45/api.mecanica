import type { FastifyInstance } from 'fastify';
import {
    serializerCompiler,
    validatorCompiler,
    type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PartCode } from '../../../shared/domain/part-code.js';
import type { ServiceOrderUseCases } from '../../composition-root.js';

const idSchema = z.string().trim().min(1).max(36);
const orderParams = z.object({ serviceOrderId: idSchema });
const partCodeSchema = z
    .string()
    .trim()
    .min(3)
    .max(50)
    .refine((value) => PartCode.isValid(value), 'Invalid part code');

export function registerServiceOrderRoutes(
    app: FastifyInstance,
    useCases: ServiceOrderUseCases,
): void {
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.post(
        '/service-orders',
        {
            schema: {
                tags: ['Service orders'],
                body: z.object({ description: z.string().trim().min(1) }),
                response: {
                    201: z.object({
                        id: z.string(),
                        description: z.string(),
                        status: z.string(),
                    }),
                },
            },
        },
        async (request, reply) => {
            const order = await useCases.registerServiceOrder.execute(
                request.body,
            );
            return reply.code(201).send(order);
        },
    );

    typedApp.post(
        '/service-orders/:serviceOrderId/supplies',
        {
            schema: {
                tags: ['Service orders'],
                params: orderParams,
                body: z.object({
                    partCode: partCodeSchema,
                    quantity: z.number().int().positive().max(2147483647),
                }),
                response: {
                    201: z.object({
                        serviceOrderId: z.string(),
                        partCode: z.string(),
                        quantity: z.number(),
                    }),
                },
            },
        },
        async (request, reply) => {
            const item = await useCases.addSupplyToServiceOrder.execute({
                ...request.body,
                ...request.params,
            });
            return reply.code(201).send(item);
        },
    );

    typedApp.post(
        '/service-orders/:serviceOrderId/supplies/:partCode/usage',
        {
            schema: {
                tags: ['Service orders'],
                params: orderParams.extend({ partCode: partCodeSchema }),
                response: {
                    200: z.object({
                        serviceOrderId: z.string(),
                        partCode: z.string(),
                        quantity: z.number(),
                        used: z.boolean(),
                    }),
                },
            },
        },
        async (request) => useCases.registerSupplyUsage.execute(request.params),
    );

    typedApp.post(
        '/service-orders/:serviceOrderId/cancel',
        {
            schema: {
                tags: ['Service orders'],
                params: orderParams,
                response: {
                    200: z.object({
                        serviceOrderId: z.string(),
                        status: z.string(),
                    }),
                },
            },
        },
        async (request) => useCases.cancelServiceOrder.execute(request.params),
    );

    typedApp.post(
        '/budgets/:budgetId/approve',
        {
            schema: {
                tags: ['Budgets'],
                params: z.object({ budgetId: idSchema }),
                response: {
                    200: z.object({
                        id: z.string(),
                        serviceOrderId: z.string(),
                        totalCents: z.number(),
                        status: z.string(),
                    }),
                },
            },
        },
        async (request) => useCases.approveBudget.execute(request.params),
    );
}
