import Fastify from 'fastify';
import { sql } from 'drizzle-orm';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyError } from 'fastify';
import { db, pool } from './infra/database/connection.js';
import { ApplicationException } from './shared/application/application-exception.js';
import { DomainException } from './shared/domain/domain-exception.js';
import { registerRegistryRoutes } from './registry/infra/http/registry-routes.js';
import type { RegistryUseCases } from './registry/composition-root.js';

export interface AppDependencies {
    registry?: RegistryUseCases;
}

export function buildApp(deps: AppDependencies = {}) {
    const app = Fastify({
        logger: true,
    });

    app.register(swagger, {
        openapi: {
            info: {
                title: 'Mechanical Workshop API',
                description: 'Registry context API',
                version: '1.0.0',
            },
        },
    });
    app.register(swaggerUi, { routePrefix: '/docs' });

    app.setErrorHandler((error, request, reply) => {
        const fastifyError = error as FastifyError;
        if (fastifyError.validation) {
            return reply.code(400).send({
                error: 'ValidationError',
                message: 'Request validation failed.',
            });
        }

        if (error instanceof ApplicationException) {
            const statusCode = error.name.includes('NotFound')
                ? 404
                : error.name.includes('AlreadyExists')
                  ? 409
                  : 400;
            return reply.code(statusCode).send({
                error: error.name,
                message: error.message,
            });
        }

        if (error instanceof DomainException) {
            return reply.code(400).send({
                error: error.name,
                message: error.message,
            });
        }

        request.log.error(error);
        return reply.code(500).send({
            error: 'InternalServerError',
            message: 'Internal server error.',
        });
    });

    app.get('/health', async (_request, reply) => {
        try {
            await db.execute(sql`SELECT 1`);
            return { status: 'ok', database: 'up' };
        } catch {
            return reply.code(503).send({
                status: 'error',
                database: 'down',
            });
        }
    });

    app.addHook('onClose', async () => {
        await pool.end();
    });

    if (deps.registry) {
        app.register(async (registryApp) => {
            registerRegistryRoutes(registryApp, deps.registry!);
        });
    }

    return app;
}
