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
import {
    actorContext,
    type ActorResolver,
    type ApplicationPermission,
} from '../../application/ports/actor-resolver.js';
import type { ServiceCatalogUseCases } from '../../catalog-composition.js';
import {
    SERVICE_DESCRIPTION_MAX_LENGTH,
    SERVICE_NAME_MAX_LENGTH,
    SERVICE_TYPE_NAME_MAX_LENGTH,
} from '../../domain/catalog/catalog-rules.js';

const managePermission = 'SERVICO_GERENCIAR' as const;

const exampleTypeId = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const exampleServiceId = '9b8a7c6d-5e4f-4a3b-2c1d-0e9f8a7b6c5d';

const idParams = z.object({ id: z.string().trim().min(1).max(36) });

const serviceTypeBody = z
    .strictObject({
        name: z.string().trim().min(1).max(SERVICE_TYPE_NAME_MAX_LENGTH),
    })
    .meta({ examples: [{ name: 'Mecânica' }] });

const serviceTypeResponse = z
    .object({ id: z.string(), name: z.string() })
    .meta({ examples: [{ id: exampleTypeId, name: 'Mecânica' }] });

const priceCentsSchema = z
    .number()
    .int()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER)
    .describe('Valor em centavos. Exemplo: 12000 corresponde a R$ 120,00.');

const serviceBody = z
    .strictObject({
        name: z.string().trim().min(1).max(SERVICE_NAME_MAX_LENGTH),
        description: z
            .string()
            .trim()
            .max(SERVICE_DESCRIPTION_MAX_LENGTH)
            .nullable()
            .optional(),
        priceCents: priceCentsSchema,
        serviceTypeId: z.string().trim().min(1).max(36),
    })
    .meta({
        examples: [
            {
                name: 'Troca de óleo',
                description: 'Drenagem e reposição do óleo do motor.',
                priceCents: 12000,
                serviceTypeId: exampleTypeId,
            },
        ],
    });

const serviceResponse = z
    .object({
        id: z.string(),
        name: z.string(),
        description: z.string().nullable(),
        priceCents: z.number(),
        serviceType: z.object({ id: z.string(), name: z.string() }),
    })
    .meta({
        examples: [
            {
                id: exampleServiceId,
                name: 'Troca de óleo',
                description: 'Drenagem e reposição do óleo do motor.',
                priceCents: 12000,
                serviceType: { id: exampleTypeId, name: 'Mecânica' },
            },
        ],
    });

export function registerServiceCatalogRoutes(
    app: FastifyInstance,
    useCases: ServiceCatalogUseCases,
    actorResolver: ActorResolver | undefined,
): void {
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    // Leitura liberada a qualquer usuário ativo (o atendente escolhe os
    // serviços da OS); alterações do catálogo somente com SERVICO_GERENCIAR.
    const requireAuth =
        (permission?: ApplicationPermission) =>
        (
            request: FastifyRequest,
            reply: FastifyReply,
            done: HookHandlerDoneFunction,
        ) => {
            const resolver = actorResolver;
            if (!resolver) {
                void reply.code(401).send({
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

    const typedApp = app.withTypeProvider<ZodTypeProvider>();
    const security = [{ bearerAuth: [] }];

    typedApp.post(
        '/service-types',
        {
            preValidation: requireAuth(managePermission),
            schema: {
                tags: ['Service catalog'],
                summary: 'Cadastra um tipo de serviço',
                security,
                body: serviceTypeBody,
                response: { 201: serviceTypeResponse },
            },
        },
        async (request, reply) => {
            const serviceType = await useCases.registerServiceType.execute(
                request.body,
            );
            return reply.code(201).send(serviceType);
        },
    );

    typedApp.get(
        '/service-types',
        {
            preValidation: requireAuth(),
            schema: {
                tags: ['Service catalog'],
                summary: 'Lista os tipos de serviço',
                security,
                response: { 200: z.array(serviceTypeResponse) },
            },
        },
        async () => useCases.listServiceTypes.execute(),
    );

    typedApp.get(
        '/service-types/:id',
        {
            preValidation: requireAuth(),
            schema: {
                tags: ['Service catalog'],
                summary: 'Consulta um tipo de serviço',
                security,
                params: idParams,
                response: { 200: serviceTypeResponse },
            },
        },
        async (request) => useCases.findServiceType.execute(request.params),
    );

    typedApp.put(
        '/service-types/:id',
        {
            preValidation: requireAuth(managePermission),
            schema: {
                tags: ['Service catalog'],
                summary: 'Renomeia um tipo de serviço',
                security,
                params: idParams,
                body: serviceTypeBody,
                response: { 200: serviceTypeResponse },
            },
        },
        async (request) =>
            useCases.updateServiceType.execute({
                ...request.body,
                id: request.params.id,
            }),
    );

    typedApp.delete(
        '/service-types/:id',
        {
            preValidation: requireAuth(managePermission),
            schema: {
                tags: ['Service catalog'],
                summary: 'Exclui um tipo de serviço sem serviços vinculados',
                description:
                    'Responde 409 enquanto houver serviços do catálogo vinculados ao tipo.',
                security,
                params: idParams,
            },
        },
        async (request, reply) => {
            await useCases.deleteServiceType.execute(request.params);
            return reply.code(204).send();
        },
    );

    typedApp.post(
        '/services',
        {
            preValidation: requireAuth(managePermission),
            schema: {
                tags: ['Service catalog'],
                summary: 'Cadastra um serviço no catálogo',
                security,
                body: serviceBody,
                response: { 201: serviceResponse },
            },
        },
        async (request, reply) => {
            const service = await useCases.registerService.execute(
                request.body,
            );
            return reply.code(201).send(service);
        },
    );

    typedApp.get(
        '/services',
        {
            preValidation: requireAuth(),
            schema: {
                tags: ['Service catalog'],
                summary: 'Lista os serviços do catálogo',
                security,
                querystring: z.object({
                    serviceTypeId: z.string().trim().min(1).max(36).optional(),
                }),
                response: { 200: z.array(serviceResponse) },
            },
        },
        async (request) =>
            useCases.listServices.execute({
                serviceTypeId: request.query.serviceTypeId,
            }),
    );

    typedApp.get(
        '/services/:id',
        {
            preValidation: requireAuth(),
            schema: {
                tags: ['Service catalog'],
                summary: 'Consulta um serviço do catálogo',
                security,
                params: idParams,
                response: { 200: serviceResponse },
            },
        },
        async (request) => useCases.findService.execute(request.params),
    );

    typedApp.put(
        '/services/:id',
        {
            preValidation: requireAuth(managePermission),
            schema: {
                tags: ['Service catalog'],
                summary: 'Atualiza um serviço do catálogo',
                description:
                    'O novo valor vale para as próximas inclusões em OS; ' +
                    'ordens que já têm o serviço mantêm o valor da inclusão.',
                security,
                params: idParams,
                body: serviceBody,
                response: { 200: serviceResponse },
            },
        },
        async (request) =>
            useCases.updateService.execute({
                ...request.body,
                id: request.params.id,
            }),
    );

    typedApp.delete(
        '/services/:id',
        {
            preValidation: requireAuth(managePermission),
            schema: {
                tags: ['Service catalog'],
                summary: 'Exclui um serviço do catálogo',
                security,
                params: idParams,
            },
        },
        async (request, reply) => {
            await useCases.deleteService.execute(request.params);
            return reply.code(204).send();
        },
    );
}
