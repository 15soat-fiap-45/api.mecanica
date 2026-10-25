import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

config({ path: 'infra/postgres/.env' });

function getDatabaseUrl(): string {
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl) {
        return databaseUrl;
    }

    const user = process.env.POSTGRES_USER;
    const password = process.env.POSTGRES_PASSWORD;
    const database = process.env.POSTGRES_DB;
    const port = process.env.POSTGRES_PORT ?? '5432';

    if (!user || !password || !database) {
        throw new Error(
            'Database configuration is missing. Set DATABASE_URL or POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DB.',
        );
    }

    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@localhost:${port}/${encodeURIComponent(database)}`;
}

export const pool = new Pool({
    connectionString: getDatabaseUrl(),
});

export const db = drizzle(pool);
