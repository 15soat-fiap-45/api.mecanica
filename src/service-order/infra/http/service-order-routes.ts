import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
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
import { PartCode } from '../../../shared/domain/part-code.js';
import {
    actorContext,
    type ServiceOrderPermission,
} from '../../application/ports/actor-resolver.js';
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
const valueCentsSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
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

    const requireAuth =
        (permission?: ServiceOrderPermission) =>
        (
            request: FastifyRequest,
            reply: FastifyReply,
            done: HookHandlerDoneFunction,
        ) => {
            const resolver = useCases.actorResolver;
            if (!resolver) {
                void reply.code(401).send({
                    error: 'UnauthorizedError',
                    message: 'Authentication required.',
                });
                return;
            }
            const authPromise = resolver.authenticate
                ? resolver.authenticate(request.headers.authorization)
                : resolver
                      .resolve(request.headers.authorization)
                      .then((id) => (id ? { id, can: () => true } : null));
            authPromise.then((actor) => {
                if (!actor) {
                    void reply.code(401).send({
                        error: 'UnauthorizedError',
                        message: 'Authentication required.',
                    });
                    return;
                }
                if (permission && !actor.can(permission)) {
                    void reply.code(403).send({
                        error: 'ForbiddenError',
                        message: 'Insufficient permissions.',
                    });
                    return;
                }
                actorContext.run(actor.id, done);
            }, done);
        };

    const publicRoute = (
        _request: FastifyRequest,
        _reply: FastifyReply,
        done: HookHandlerDoneFunction,
    ) => {
        actorContext.run(null, done);
    };

    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.post(
        '/service-orders',
        {
            preValidation: requireAuth('OS_CRIAR'),
            schema: {
                tags: ['Service orders'],
                body: z.object({
                    description: z.string().trim().min(1),
                    vehicleId: idSchema,
                    valueCents: valueCentsSchema.nullable().optional(),
                }),
                response: {
                    201: z.object({
                        id: z.string(),
                        description: z.string(),
                        status: z.string(),
                        vehicleId: z.string(),
                        valueCents: valueCentsSchema.nullable(),
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

    typedApp.get(
        '/service-orders/:serviceOrderId',
        {
            preValidation: requireAuth(),
            schema: { tags: ['Service orders'], params: orderParams },
        },
        async (request) => useCases.findServiceOrder.execute(request.params),
    );

    typedApp.get(
        '/service-orders/:serviceOrderId/history',
        {
            preValidation: requireAuth(),
            schema: {
                tags: ['Service orders'],
                params: orderParams,
                response: {
                    200: z.object({
                        serviceOrderId: z.string(),
                        history: z.array(
                            z.object({
                                status: z.string(),
                                valueCents: z
                                    .number()
                                    .int()
                                    .nonnegative()
                                    .nullable(),
                                changedBy: z.string().nullable(),
                                recordedAt: z.string(),
                            }),
                        ),
                    }),
                },
            },
        },
        async (request) =>
            useCases.findServiceOrderHistory.execute(request.params),
    );

    typedApp.post(
        '/service-orders/:serviceOrderId/supplies',
        {
            preValidation: requireAuth('ESTOQUE_BAIXAR'),
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
            preValidation: requireAuth('ESTOQUE_BAIXAR'),
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
            preValidation: requireAuth('OS_CRIAR'),
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
            preValidation: requireAuth('OS_CONCLUIR'),
            schema: {
                tags: ['Service orders'],
                params: orderParams,
                body: z
                    .object({
                        valueCents: valueCentsSchema.optional(),
                    })
                    .nullish(),
                response: {
                    200: z.object({
                        status: z.string(),
                    }),
                },
            },
        },
        async (request) =>
            useCases.awaitBudgetApproval.execute({
                serviceOrderId: request.params.serviceOrderId,
                valueCents: request.body?.valueCents,
            }),
    );

    for (const [path, useCase, permission] of [
        ['start', useCases.startExecution, 'OS_CONCLUIR'],
        ['finish', useCases.finishServiceOrder, 'OS_CONCLUIR'],
        ['deliver', useCases.deliverServiceOrder, 'OS_CRIAR'],
    ] as const) {
        typedApp.post(
            `/service-orders/:serviceOrderId/${path}`,
            {
                preValidation: requireAuth(permission),
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
            preValidation: publicRoute,
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
