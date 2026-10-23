import { sql } from 'drizzle-orm';
import { db, pool } from './connection.js';

try {
    const result = await db.execute<{ connected: number }>(
        sql`SELECT 1 AS connected`,
    );

    console.log('Conexão com o PostgreSQL estabelecida:', result.rows[0]);
} finally {
    await pool.end();
}
