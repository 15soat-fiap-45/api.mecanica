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

const partCodeSchema = z
    .string()
    .trim()
    .min(3)
    .max(50)
    .refine((value) => PartCode.isValid(value), 'Invalid part code');

const durationStatsSchema = z.object({
    count: z.number().int().min(0),
    averageMs: z.number().nullable(),
    minMs: z.number().nullable(),
    maxMs: z.number().nullable(),
});

const periodSchema = z.object({
    from: z.string().nullable(),
    to: z.string().nullable(),
});

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
                querystring: z.object({
                    from: isoDateQuerySchema.optional(),
                    to: isoDateQuerySchema.optional(),
                }),
                response: {
                    200: z.object({
                        period: periodSchema,
                        totalLeadTime: durationStatsSchema,
                        executionTime: durationStatsSchema,
                        deliveryLeadTime: durationStatsSchema,
                    }),
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
                querystring: z.object({
                    partCode: partCodeSchema.optional(),
                    from: isoDateQuerySchema.optional(),
                    to: isoDateQuerySchema.optional(),
                }),
                response: {
                    200: z.object({
                        period: periodSchema,
                        policy: z
                            .object({ name: z.string() })
                            .catchall(z.unknown()),
                        overall: durationStatsSchema,
                        byPart: z.array(
                            durationStatsSchema.extend({
                                partCode: z.string(),
                                openCycleSince: z.string().nullable(),
                            }),
                        ),
                    }),
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
