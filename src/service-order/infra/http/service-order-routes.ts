import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import {
    serializerCompiler,
    validatorCompiler,
    type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PartCode } from '../../../shared/domain/part-code.js';
import type { ServiceOrderUseCases } from '../../composition-root.js';

function getApprovalHtml(): string {
    const filePath = path.resolve(process.cwd(), 'public', 'orcamento.html');
    if (existsSync(filePath)) {
        return readFileSync(filePath, 'utf-8');
    }
    return '<!doctype html><html lang="pt-BR"><body><h1>Oficina Mecânica - Aprovação de Orçamento</h1></body></html>';
}

const idSchema = z.string().trim().min(1).max(36);
const orderParams = z.object({ serviceOrderId: idSchema });
const serviceIdSchema = z
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER);
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
                body: z.object({
                    description: z.string().trim().min(1),
                    vehicleId: idSchema,
                }),
                response: {
                    201: z.object({
                        id: z.string(),
                        description: z.string(),
                        status: z.string(),
                        vehicleId: z.string(),
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
        '/services',
        {
            schema: {
                tags: ['Service orders'],
                body: z.object({
                    title: z.string().trim().min(1).max(20),
                    description: z.string().max(200).nullable().optional(),
                    valueCents: z
                        .number()
                        .int()
                        .min(0)
                        .max(Number.MAX_SAFE_INTEGER),
                    partIds: z.array(serviceIdSchema).default([]),
                }),
                response: {
                    201: z.object({
                        id: serviceIdSchema,
                        title: z.string(),
                        description: z.string().nullable(),
                        valueCents: z.number(),
                        partIds: z.array(serviceIdSchema),
                    }),
                },
            },
        },
        async (request, reply) =>
            reply.code(201).send(
                await useCases.serviceCatalog.create({
                    ...request.body,
                    description: request.body.description ?? null,
                }),
            ),
    );

    typedApp.get(
        '/services',
        {
            schema: { tags: ['Service orders'] },
        },
        async () => useCases.serviceCatalog.list(),
    );

    typedApp.post(
        '/service-orders/:serviceOrderId/services',
        {
            schema: {
                tags: ['Service orders'],
                params: orderParams,
                body: z.object({ serviceId: serviceIdSchema }),
                response: {
                    201: z.object({
                        serviceOrderId: z.string(),
                        serviceId: serviceIdSchema,
                    }),
                },
            },
        },
        async (request, reply) => {
            await useCases.serviceCatalog.assign(
                request.params.serviceOrderId,
                request.body.serviceId,
            );
            return reply.code(201).send({
                serviceOrderId: request.params.serviceOrderId,
                serviceId: request.body.serviceId,
            });
        },
    );

    typedApp.get(
        '/service-orders/:serviceOrderId',
        {
            schema: { tags: ['Service orders'], params: orderParams },
        },
        async (request) => useCases.findServiceOrder.execute(request.params),
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
        '/service-orders/:serviceOrderId/awaiting-approval',
        {
            schema: {
                tags: ['Service orders'],
                params: orderParams,
                response: {
                    200: z.object({
                        status: z.string(),
                    }),
                },
            },
        },
        async (request) => useCases.awaitBudgetApproval.execute(request.params),
    );

    for (const [path, useCase] of [
        ['start', useCases.startExecution],
        ['finish', useCases.finishServiceOrder],
        ['deliver', useCases.deliverServiceOrder],
    ] as const) {
        typedApp.post(
            `/service-orders/:serviceOrderId/${path}`,
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
            async (request) => useCase.execute(request.params),
        );
    }

    typedApp.post(
        '/budget-approvals/decide',
        {
            schema: {
                tags: ['Budgets'],
                body: z.object({
                    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
                    decision: z.enum(['approved', 'rejected']),
                    rejectionReason: z.string().trim().max(1000).optional(),
                }),
                response: {
                    200: z.object({
                        status: z.enum(['decided', 'already_decided']),
                        decision: z.enum(['approved', 'rejected']),
                    }),
                },
            },
        },
        async (request) => useCases.decideBudgetApproval.execute(request.body),
    );

    typedApp.get(
        '/orcamento/:token',
        {
            schema: {
                tags: ['Budgets'],
                params: z.object({
                    token: z.string(),
                }),
                produces: ['text/html'],
            },
        },
        async (_request, reply) => {
            return reply
                .type('text/html; charset=utf-8')
                .send(getApprovalHtml());
        },
    );

    typedApp.get(
        '/orcamento',
        {
            schema: {
                tags: ['Budgets'],
                produces: ['text/html'],
            },
        },
        async (_request, reply) => {
            return reply
                .type('text/html; charset=utf-8')
                .send(getApprovalHtml());
        },
    );
}
