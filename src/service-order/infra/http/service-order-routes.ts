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
import { registerServiceCatalogRoutes } from './service-catalog-routes.js';
import {
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
} from '../../application/use-cases/list-service-orders.js';
import { ServiceOrderStatus } from '../../domain/service-order/value-objects/service-order-status.js';

function getApprovalHtml(): string {
    const filePath = path.resolve(process.cwd(), 'public', 'orcamento.html');
    if (existsSync(filePath)) {
        return readFileSync(filePath, 'utf-8');
    }
    return '<!doctype html><html lang="pt-BR"><body><h1>Oficina Mecânica - Aprovação de Orçamento</h1></body></html>';
}

const exampleOrderId = '550e8400-e29b-41d4-a716-446655440000';
const exampleVehicleId = '6f9619ff-8b86-4d01-b42d-00c04fc964ff';
const exampleServiceId = '9b8a7c6d-5e4f-4a3b-2c1d-0e9f8a7b6c5d';
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
const centsSchema = z
    .number()
    .int()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER)
    .describe('Valor em centavos. Exemplo: 35000 corresponde a R$ 350,00.');
const orderServiceSchema = z.object({
    serviceId: z.string(),
    name: z.string(),
    priceCents: centsSchema,
});
const exampleOrderService = {
    serviceId: exampleServiceId,
    name: 'Troca de pastilhas de freio',
    priceCents: 18000,
};
const exampleSupply = {
    partCode: 'PAST-FREIO-01',
    description: 'Pastilha de freio dianteira',
    quantity: 2,
    unitPriceCents: 8500,
    totalCents: 17000,
};
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
                        serviceIds: z
                            .array(idSchema)
                            .max(50)
                            .optional()
                            .describe(
                                'Serviços do catálogo solicitados pelo cliente. O valor de cada um é copiado do catálogo.',
                            ),
                    })
                    .meta({
                        examples: [
                            {
                                description: 'Barulho ao frear',
                                vehicleId: exampleVehicleId,
                                serviceIds: [exampleServiceId],
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
                            services: z.array(orderServiceSchema),
                            totalCents: centsSchema,
                        })
                        .meta({
                            examples: [
                                {
                                    id: exampleOrderId,
                                    description: 'Barulho ao frear',
                                    status: 'PENDING',
                                    vehicleId: exampleVehicleId,
                                    services: [exampleOrderService],
                                    totalCents: 18000,
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
        '/service-orders',
        {
            preValidation: requireAuth(),
            schema: {
                tags: ['Service orders'],
                summary: 'Lista as ordens de serviço',
                description:
                    'Ordenada da OS aberta mais recentemente para a mais antiga. ' +
                    'Filtros opcionais por status (separados por vírgula) e por veículo.',
                querystring: z.object({
                    status: z
                        .string()
                        .trim()
                        .optional()
                        .transform((value) =>
                            value
                                ?.split(',')
                                .map((s) => s.trim().toUpperCase())
                                .filter(Boolean),
                        )
                        .refine(
                            (values) =>
                                !values ||
                                values.every((v) =>
                                    ServiceOrderStatus.isValid(v),
                                ),
                            'Invalid service order status',
                        )
                        .describe('Ex.: PENDING,IN_PROGRESS'),
                    vehicleId: idSchema.optional(),
                    limit: z.coerce
                        .number()
                        .int()
                        .min(1)
                        .max(MAX_PAGE_SIZE)
                        .default(DEFAULT_PAGE_SIZE),
                    offset: z.coerce.number().int().min(0).default(0),
                }),
                response: {
                    200: z
                        .object({
                            items: z.array(
                                z.object({
                                    id: z.string(),
                                    vehicleId: z.string().nullable(),
                                    description: z.string(),
                                    status: z.string(),
                                    openedAt: z.string().nullable(),
                                    totalCents: centsSchema,
                                }),
                            ),
                            total: z.number().int().nonnegative(),
                            limit: z.number().int(),
                            offset: z.number().int(),
                        })
                        .meta({
                            examples: [
                                {
                                    items: [
                                        {
                                            id: exampleOrderId,
                                            vehicleId: exampleVehicleId,
                                            description: 'Barulho ao frear',
                                            status: 'IN_PROGRESS',
                                            openedAt:
                                                '2026-10-28T12:00:00.000Z',
                                            totalCents: 35000,
                                        },
                                    ],
                                    total: 1,
                                    limit: 20,
                                    offset: 0,
                                },
                            ],
                        }),
                },
            },
        },
        async (request) =>
            useCases.listServiceOrders.execute({
                statuses: request.query.status,
                vehicleId: request.query.vehicleId,
                limit: request.query.limit,
                offset: request.query.offset,
            }),
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
                            services: z.array(orderServiceSchema),
                            supplies: z.array(
                                z.object({
                                    partCode: z.string(),
                                    description: z.string().nullable(),
                                    quantity: z.number(),
                                    unitPriceCents: centsSchema,
                                    totalCents: centsSchema,
                                    used: z.boolean(),
                                }),
                            ),
                            totalCents: centsSchema.describe(
                                'Serviços + peças (quantidade x valor unitário), em centavos.',
                            ),
                        })
                        .meta({
                            examples: [
                                {
                                    id: exampleOrderId,
                                    vehicleId: exampleVehicleId,
                                    description: 'Barulho ao frear',
                                    status: 'IN_PROGRESS',
                                    services: [exampleOrderService],
                                    supplies: [
                                        { ...exampleSupply, used: true },
                                    ],
                                    totalCents: 35000,
                                },
                            ],
                        }),
                },
            },
        },
        async (request) => useCases.findServiceOrder.execute(request.params),
    );

    typedApp.patch(
        '/service-orders/:serviceOrderId/description',
        {
            preValidation: requireAuth('OS_CONCLUIR'),
            schema: {
                tags: ['Service orders'],
                summary:
                    'Atualiza a descrição durante a avaliação da OS pendente',
                params: orderParams,
                body: z.object({ description: z.string().trim().min(1) }).meta({
                    examples: [
                        {
                            description:
                                'Pastilhas desgastadas; substituir o par dianteiro.',
                        },
                    ],
                }),
                response: {
                    200: z
                        .object({
                            serviceOrderId: z.string(),
                            description: z.string(),
                        })
                        .meta({
                            examples: [
                                {
                                    serviceOrderId: exampleOrderId,
                                    description:
                                        'Pastilhas desgastadas; substituir o par dianteiro.',
                                },
                            ],
                        }),
                },
            },
        },
        async (request) =>
            useCases.updateServiceOrderDescription.execute({
                ...request.params,
                ...request.body,
            }),
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
        '/service-orders/:serviceOrderId/tracking',
        {
            preValidation: publicRoute,
            config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
            schema: {
                tags: ['Service orders'],
                summary: 'Consulta pública do andamento da OS pelo cliente',
                description:
                    'Não exige login. O cliente informa o CPF/CNPJ do titular do veículo no corpo; ' +
                    'se o documento não corresponder à OS, a resposta é 404, como se ela não existisse. ' +
                    'Limitado a 10 consultas por minuto por IP.',
                params: orderParams,
                body: z
                    .object({
                        document: z
                            .string()
                            .trim()
                            .refine(
                                (value) =>
                                    [11, 14].includes(
                                        value.replace(/\D/g, '').length,
                                    ),
                                'CPF/CNPJ must have 11 or 14 digits',
                            )
                            .describe(
                                'CPF ou CNPJ do titular do veículo, com ou sem máscara.',
                            ),
                    })
                    .meta({ examples: [{ document: '529.982.247-25' }] }),
                response: {
                    200: z
                        .object({
                            serviceOrderId: z.string(),
                            description: z.string(),
                            status: z.string(),
                            totalCents: centsSchema,
                            history: z.array(
                                z.object({
                                    status: z.string(),
                                    recordedAt: z.string(),
                                }),
                            ),
                        })
                        .meta({
                            examples: [
                                {
                                    serviceOrderId: exampleOrderId,
                                    description: 'Troca de pastilhas de freio',
                                    status: 'IN_PROGRESS',
                                    totalCents: 35000,
                                    history: [
                                        {
                                            status: 'PENDING',
                                            recordedAt:
                                                '2026-10-28T12:00:00.000Z',
                                        },
                                        {
                                            status: 'AWAITING_APPROVAL',
                                            recordedAt:
                                                '2026-10-28T13:00:00.000Z',
                                        },
                                        {
                                            status: 'APPROVED',
                                            recordedAt:
                                                '2026-10-28T13:15:00.000Z',
                                        },
                                        {
                                            status: 'IN_PROGRESS',
                                            recordedAt:
                                                '2026-10-28T14:00:00.000Z',
                                        },
                                    ],
                                },
                            ],
                        }),
                },
            },
        },
        async (request) =>
            useCases.trackServiceOrder.execute({
                ...request.params,
                ...request.body,
            }),
    );

    const servicesResponse = z
        .object({
            serviceOrderId: z.string(),
            services: z.array(orderServiceSchema),
            totalCents: centsSchema,
        })
        .meta({
            examples: [
                {
                    serviceOrderId: exampleOrderId,
                    services: [exampleOrderService],
                    totalCents: 18000,
                },
            ],
        });

    typedApp.get(
        '/service-orders/:serviceOrderId/budget',
        {
            preValidation: requireAuth(),
            schema: {
                tags: ['Budgets'],
                summary: 'Detalha o orçamento da OS (serviços, peças e totais)',
                description:
                    '`totalCents` é o valor enviado ao cliente para aprovação. ' +
                    '`currentTotalCents` é o total atual da OS e difere do orçado quando ' +
                    'insumos adicionais são incluídos depois do envio. Responde 404 se o orçamento ainda não foi gerado.',
                params: orderParams,
                response: {
                    200: z
                        .object({
                            budgetId: z.string(),
                            serviceOrderId: z.string(),
                            status: z
                                .string()
                                .describe('PENDING, APPROVED ou REJECTED'),
                            services: z.array(orderServiceSchema),
                            parts: z.array(
                                z.object({
                                    partCode: z.string(),
                                    description: z.string().nullable(),
                                    quantity: z.number(),
                                    unitPriceCents: centsSchema,
                                    totalCents: centsSchema,
                                }),
                            ),
                            servicesCents: centsSchema,
                            partsCents: centsSchema,
                            totalCents: centsSchema,
                            currentTotalCents: centsSchema,
                        })
                        .meta({
                            examples: [
                                {
                                    budgetId:
                                        '1d2c3b4a-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
                                    serviceOrderId: exampleOrderId,
                                    status: 'APPROVED',
                                    services: [exampleOrderService],
                                    parts: [exampleSupply],
                                    servicesCents: 18000,
                                    partsCents: 17000,
                                    totalCents: 35000,
                                    currentTotalCents: 35000,
                                },
                            ],
                        }),
                },
            },
        },
        async (request) =>
            useCases.getServiceOrderBudget.execute(request.params),
    );

    typedApp.post(
        '/service-orders/:serviceOrderId/services',
        {
            preValidation: requireAuth('OS_CONCLUIR'),
            schema: {
                tags: ['Service orders'],
                summary: 'Inclui um serviço do catálogo na OS pendente',
                description:
                    'Nome e valor são copiados do catálogo no momento da inclusão. ' +
                    'Permitido somente enquanto a OS está em avaliação (PENDING).',
                params: orderParams,
                body: z
                    .object({ serviceId: idSchema })
                    .meta({ examples: [{ serviceId: exampleServiceId }] }),
                response: { 201: servicesResponse },
            },
        },
        async (request, reply) => {
            const result = await useCases.addServiceToServiceOrder.execute({
                ...request.params,
                ...request.body,
            });
            return reply.code(201).send(result);
        },
    );

    typedApp.delete(
        '/service-orders/:serviceOrderId/services/:serviceId',
        {
            preValidation: requireAuth('OS_CONCLUIR'),
            schema: {
                tags: ['Service orders'],
                summary: 'Remove um serviço da OS pendente',
                params: orderParams.extend({ serviceId: idSchema }),
                response: { 200: servicesResponse },
            },
        },
        async (request) =>
            useCases.removeServiceFromServiceOrder.execute(request.params),
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
                            description: z.string().nullable(),
                            unitPriceCents: centsSchema,
                        })
                        .meta({
                            examples: [
                                {
                                    serviceOrderId: exampleOrderId,
                                    partCode: 'PAST-FREIO-01',
                                    quantity: 2,
                                    description: 'Pastilha de freio dianteira',
                                    unitPriceCents: 8500,
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
                description:
                    'Gera o orçamento somando os serviços da OS e as peças/insumos ' +
                    '(quantidade x valor unitário) e envia ao cliente o e-mail com o detalhamento.',
                body: z
                    .object({
                        description: z.string().trim().min(1).optional(),
                    })
                    .nullish()
                    .describe(
                        'Permite informar a descrição da avaliação. Se omitida, a descrição da OS é preservada.',
                    )
                    .meta({
                        examples: [
                            {
                                description:
                                    'Pastilhas desgastadas; substituir o par dianteiro.',
                            },
                        ],
                    }),
                response: {
                    200: z
                        .object({
                            status: z.string(),
                            totalCents: centsSchema,
                        })
                        .meta({
                            examples: [
                                {
                                    status: 'AWAITING_APPROVAL',
                                    totalCents: 35000,
                                },
                            ],
                        }),
                },
            },
        },
        async (request) =>
            useCases.awaitBudgetApproval.execute({
                serviceOrderId: request.params.serviceOrderId,
                description: request.body?.description,
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

    registerServiceCatalogRoutes(app, useCases.catalog, useCases.actorResolver);
}
