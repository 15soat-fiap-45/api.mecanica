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
import type { BiPermission } from '../../application/ports/bi-access-guard.js';
import type { BusinessIntelligenceUseCases } from '../../composition-root.js';

const isoDateQuerySchema = z
    .string()
    .trim()
    .refine((value) => !Number.isNaN(Date.parse(value)), {
        message: 'Invalid ISO-8601 date',
    });

const fromQuerySchema = isoDateQuerySchema.optional().meta({
    description:
        'Início do período (data/hora ISO-8601, inclusivo). Se omitido, não há limite inicial.',
    example: '2026-01-01T00:00:00Z',
});

const toQuerySchema = isoDateQuerySchema.optional().meta({
    description:
        'Fim do período (data/hora ISO-8601, inclusivo). Deve ser maior ou igual a "from". Se omitido, não há limite final.',
    example: '2026-12-31T23:59:59Z',
});

const partCodeSchema = z
    .string()
    .trim()
    .min(3)
    .max(50)
    .refine((value) => PartCode.isValid(value), 'Invalid part code');

const durationStatsSchema = z.object({
    count: z.number().int().min(0).meta({
        description: 'Quantidade de ocorrências consideradas no cálculo.',
    }),
    averageMs: z.number().nullable().meta({
        description:
            'Duração média em milissegundos (null quando não há ocorrências).',
    }),
    minMs: z.number().nullable().meta({
        description:
            'Menor duração em milissegundos (null quando não há ocorrências).',
    }),
    maxMs: z.number().nullable().meta({
        description:
            'Maior duração em milissegundos (null quando não há ocorrências).',
    }),
});

const periodSchema = z
    .object({
        from: z.string().nullable().meta({
            description: 'Início do período aplicado (null se não informado).',
        }),
        to: z.string().nullable().meta({
            description: 'Fim do período aplicado (null se não informado).',
        }),
    })
    .meta({ description: 'Período usado no filtro, em ISO-8601.' });

const errorResponseSchema = (description: string) =>
    z
        .object({
            error: z.string().meta({ description: 'Tipo do erro.' }),
            message: z
                .string()
                .meta({ description: 'Mensagem descrevendo o erro.' }),
        })
        .meta({ description });

const biErrorResponses = {
    400: errorResponseSchema(
        'Parâmetros inválidos (data fora do ISO-8601, código de peça inválido ou "from" maior que "to").',
    ),
    401: errorResponseSchema('Token ausente, inválido ou expirado.'),
    403: errorResponseSchema(
        'O usuário autenticado não tem a permissão BI_VISUALIZAR (somente GERENTE).',
    ),
};

export function registerBusinessIntelligenceRoutes(
    app: FastifyInstance,
    useCases: BusinessIntelligenceUseCases,
): void {
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    const requireBiAccess =
        (permission: BiPermission) =>
        (
            request: FastifyRequest,
            reply: FastifyReply,
            done: HookHandlerDoneFunction,
        ) => {
            const guard = useCases.accessGuard;
            if (!guard) {
                void reply.code(401).send({
                    error: 'UnauthorizedError',
                    message: 'Authentication required.',
                });
                return;
            }
            guard.authenticate(request.headers.authorization).then((actor) => {
                if (!actor) {
                    void reply.code(401).send({
                        error: 'UnauthorizedError',
                        message: 'Authentication required.',
                    });
                    return;
                }
                if (!actor.can(permission)) {
                    void reply.code(403).send({
                        error: 'ForbiddenError',
                        message: 'Insufficient permissions.',
                    });
                    return;
                }
                done();
            }, done);
        };

    const typedApp = app.withTypeProvider<ZodTypeProvider>();

    typedApp.get(
        '/bi/service-orders/lead-time',
        {
            preValidation: requireBiAccess('BI_VISUALIZAR'),
            schema: {
                tags: ['Business intelligence'],
                summary: 'Lead time das ordens de serviço',
                description:
                    'Retorna estatísticas (quantidade, média, mínimo e máximo, em milissegundos) dos tempos das ordens de serviço. ' +
                    'Ordens canceladas são desconsideradas. ' +
                    'totalLeadTime e executionTime consideram as OS finalizadas no período; deliveryLeadTime considera as OS entregues no período. ' +
                    'Exige JWT com a permissão BI_VISUALIZAR (GERENTE).',
                security: [{ bearerAuth: [] }],
                querystring: z.object({
                    from: fromQuerySchema,
                    to: toQuerySchema,
                }),
                response: {
                    200: z
                        .object({
                            period: periodSchema,
                            totalLeadTime: durationStatsSchema.meta({
                                description:
                                    'Tempo total: da abertura da OS até a finalização.',
                            }),
                            executionTime: durationStatsSchema.meta({
                                description:
                                    'Tempo de execução: do início da execução até a finalização.',
                            }),
                            deliveryLeadTime: durationStatsSchema.meta({
                                description:
                                    'Tempo até a entrega: da abertura da OS até a entrega ao cliente.',
                            }),
                        })
                        .meta({ description: 'Métricas calculadas.' }),
                    ...biErrorResponses,
                },
            },
        },
        async (request) => {
            const { from, to } = request.query;
            return useCases.getServiceOrderLeadTime.execute({
                from: from ? new Date(from) : undefined,
                to: to ? new Date(to) : undefined,
            });
        },
    );

    typedApp.get(
        '/bi/stock/restock-lead-time',
        {
            preValidation: requireBiAccess('BI_VISUALIZAR'),
            schema: {
                tags: ['Business intelligence'],
                summary: 'Lead time de reposição de estoque',
                description:
                    'Retorna estatísticas (quantidade, média, mínimo e máximo, em milissegundos) do tempo de reposição das peças. ' +
                    'Pela política padrão (REORDER_POINT), um ciclo abre quando uma saída deixa o estoque no ponto de reposição ou abaixo dele ' +
                    'e fecha na próxima entrada que o eleva acima desse ponto. Devoluções (ex.: reserva cancelada) não contam como reposição. ' +
                    'Exige JWT com a permissão BI_VISUALIZAR (GERENTE).',
                security: [{ bearerAuth: [] }],
                querystring: z.object({
                    partCode: partCodeSchema.optional().meta({
                        description:
                            'Código da peça para filtrar o resultado. Se omitido, retorna todas as peças.',
                    }),
                    from: fromQuerySchema,
                    to: toQuerySchema,
                }),
                response: {
                    200: z
                        .object({
                            period: periodSchema,
                            policy: z
                                .object({
                                    name: z.string().meta({
                                        description:
                                            'Nome da política de ciclo de reposição.',
                                        example: 'REORDER_POINT',
                                    }),
                                })
                                .catchall(z.unknown())
                                .meta({
                                    description:
                                        'Política usada no cálculo e seus parâmetros (ex.: reorderPoint).',
                                }),
                            overall: durationStatsSchema.meta({
                                description:
                                    'Estatísticas consolidadas de todos os ciclos fechados.',
                            }),
                            byPart: z
                                .array(
                                    durationStatsSchema.extend({
                                        partCode: z.string().meta({
                                            description: 'Código da peça.',
                                        }),
                                        openCycleSince: z
                                            .string()
                                            .nullable()
                                            .meta({
                                                description:
                                                    'Início (ISO-8601) do ciclo de reposição ainda aberto, ou null se não houver.',
                                            }),
                                    }),
                                )
                                .meta({
                                    description: 'Estatísticas por peça.',
                                }),
                        })
                        .meta({ description: 'Métricas calculadas.' }),
                    ...biErrorResponses,
                },
            },
        },
        async (request) => {
            const { partCode, from, to } = request.query;
            return useCases.getRestockLeadTime.execute({
                partCode,
                from: from ? new Date(from) : undefined,
                to: to ? new Date(to) : undefined,
            });
        },
    );
}
