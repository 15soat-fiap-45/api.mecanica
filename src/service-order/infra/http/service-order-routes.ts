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

const exampleOrderId = '550e8400-e29b-41d4-a716-446655440000';
const exampleVehicleId = '6f9619ff-8b86-4d01-b42d-00c04fc964ff';
const exampleToken = 'abcdefghijklmnopqrstuvwxyz0123456789-_ABCDE';
const idSchema = z
    .string()
    .trim()
    .min(1)
    .max(36)
    .meta({
        examples: [exampleOrderId],
    });
const orderParams = z.object({ serviceOrderId: idSchema });
const valueCentsSchema = z
    .number()
    .int()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER)
    .describe('Valor em centavos. Exemplo: 35000 corresponde a R$ 350,00.');
const partCodeSchema = z
    .string()
    .trim()
    .min(3)
    .max(50)
    .refine((value) => PartCode.isValid(value), 'Invalid part code')
    .meta({ examples: ['PAST-FREIO-01'] });

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
                body: z
                    .object({
                        description: z.string().trim().min(1),
                        vehicleId: idSchema.meta({
                            examples: [exampleVehicleId],
                        }),
                        valueCents: valueCentsSchema.nullable().optional(),
                    })
                    .meta({
                        examples: [
                            {
                                description: 'Troca de pastilhas de freio',
                                vehicleId: exampleVehicleId,
                                valueCents: 35000,
                            },
                        ],
                    }),
                response: {
                    201: z
                        .object({
                            id: z.string(),
                            description: z.string(),
                            status: z.string(),
                            vehicleId: z.string(),
                            valueCents: valueCentsSchema.nullable(),
                        })
                        .meta({
                            examples: [
                                {
                                    id: exampleOrderId,
                                    description: 'Troca de pastilhas de freio',
                                    status: 'PENDING',
                                    vehicleId: exampleVehicleId,
                                    valueCents: 35000,
                                },
                            ],
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
            schema: {
                tags: ['Service orders'],
                params: orderParams,
                response: {
                    200: z
                        .object({
                            id: z.string(),
                            vehicleId: z.string().nullable(),
                            description: z.string(),
                            status: z.string(),
                            valueCents: valueCentsSchema.nullable(),
                            supplies: z.array(
                                z.object({
                                    partCode: z.string(),
                                    quantity: z.number(),
                                    used: z.boolean(),
                                }),
                            ),
                        })
                        .meta({
                            examples: [
                                {
                                    id: exampleOrderId,
                                    vehicleId: exampleVehicleId,
                                    description: 'Troca de pastilhas de freio',
                                    status: 'IN_PROGRESS',
                                    valueCents: 35000,
                                    supplies: [
                                        {
                                            partCode: 'PAST-FREIO-01',
                                            quantity: 2,
                                            used: true,
                                        },
                                    ],
                                },
                            ],
                        }),
                },
            },
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
                    200: z
                        .object({
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
                        })
                        .meta({
                            examples: [
                                {
                                    serviceOrderId: exampleOrderId,
                                    history: [
                                        {
                                            status: 'PENDING',
                                            valueCents: null,
                                            changedBy: 'atendente-1',
                                            recordedAt:
                                                '2026-10-28T12:00:00.000Z',
                                        },
                                        {
                                            status: 'AWAITING_APPROVAL',
                                            valueCents: 35000,
                                            changedBy: 'mecanico-1',
                                            recordedAt:
                                                '2026-10-28T13:00:00.000Z',
                                        },
                                        {
                                            status: 'APPROVED',
                                            valueCents: 35000,
                                            changedBy: null,
                                            recordedAt:
                                                '2026-10-28T13:15:00.000Z',
                                        },
                                    ],
                                },
                            ],
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
                body: z
                    .object({
                        partCode: partCodeSchema,
                        quantity: z.number().int().positive().max(2147483647),
                    })
                    .meta({
                        examples: [{ partCode: 'PAST-FREIO-01', quantity: 2 }],
                    }),
                response: {
                    201: z
                        .object({
                            serviceOrderId: z.string(),
                            partCode: z.string(),
                            quantity: z.number(),
                        })
                        .meta({
                            examples: [
                                {
                                    serviceOrderId: exampleOrderId,
                                    partCode: 'PAST-FREIO-01',
                                    quantity: 2,
                                },
                            ],
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
                    200: z
                        .object({
                            serviceOrderId: z.string(),
                            partCode: z.string(),
                            quantity: z.number(),
                            used: z.boolean(),
                        })
                        .meta({
                            examples: [
                                {
                                    serviceOrderId: exampleOrderId,
                                    partCode: 'PAST-FREIO-01',
                                    quantity: 2,
                                    used: true,
                                },
                            ],
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
                    200: z
                        .object({
                            serviceOrderId: z.string(),
                            status: z.string(),
                        })
                        .meta({
                            examples: [
                                {
                                    serviceOrderId: exampleOrderId,
                                    status: 'CANCELLED',
                                },
                            ],
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
                    .nullish()
                    .describe(
                        'Opcional quando a OS já possui um valor definido. O valor é informado em centavos.',
                    )
                    .meta({ examples: [{ valueCents: 35000 }] }),
                response: {
                    200: z
                        .object({
                            status: z.string(),
                        })
                        .meta({ examples: [{ status: 'AWAITING_APPROVAL' }] }),
                },
            },
        },
        async (request) =>
            useCases.awaitBudgetApproval.execute({
                serviceOrderId: request.params.serviceOrderId,
                valueCents: request.body?.valueCents,
            }),
    );

    for (const [path, useCase, permission, status] of [
        ['start', useCases.startExecution, 'OS_CONCLUIR', 'IN_PROGRESS'],
        ['finish', useCases.finishServiceOrder, 'OS_CONCLUIR', 'COMPLETED'],
        ['deliver', useCases.deliverServiceOrder, 'OS_CRIAR', 'DELIVERED'],
    ] as const) {
        typedApp.post(
            `/service-orders/:serviceOrderId/${path}`,
            {
                preValidation: requireAuth(permission),
                schema: {
                    tags: ['Service orders'],
                    params: orderParams,
                    response: {
                        200: z
                            .object({
                                serviceOrderId: z.string(),
                                status: z.string(),
                            })
                            .meta({
                                examples: [
                                    { serviceOrderId: exampleOrderId, status },
                                ],
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
                body: z
                    .object({
                        token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
                        decision: z.enum(['approved', 'rejected']),
                        rejectionReason: z.string().trim().max(1000).optional(),
                    })
                    .meta({
                        examples: [
                            { token: exampleToken, decision: 'approved' },
                            {
                                token: exampleToken,
                                decision: 'rejected',
                                rejectionReason:
                                    'Não autorizo o serviço neste momento.',
                            },
                        ],
                        description:
                            'Substitua o token do exemplo pelo token de uso único recebido por e-mail.',
                    }),
                response: {
                    200: z
                        .object({
                            status: z.enum(['decided', 'already_decided']),
                            decision: z.enum(['approved', 'rejected']),
                        })
                        .meta({
                            examples: [
                                { status: 'decided', decision: 'approved' },
                                { status: 'decided', decision: 'rejected' },
                                {
                                    status: 'already_decided',
                                    decision: 'approved',
                                },
                            ],
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
