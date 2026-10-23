import Fastify from 'fastify';
import { sql } from 'drizzle-orm';
import { db, pool } from './infra/database/connection.js';

export function buildApp() {
    const app = Fastify({
        logger: true,
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

    return app;
}
