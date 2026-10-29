import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: 'infra/postgres/.env' });

export default defineConfig({
    dialect: 'postgresql',
    schema: './src/infra/database/schema.ts',
    out: './drizzle',
    dbCredentials: {
        url: process.env.DATABASE_URL ?? buildDatabaseUrl(),
    },
});

function buildDatabaseUrl(): string {
    const user = process.env.POSTGRES_USER;
    const password = process.env.POSTGRES_PASSWORD;
    const database = process.env.POSTGRES_DB;
    const host = process.env.POSTGRES_HOST ?? 'localhost';
    const port = process.env.POSTGRES_PORT ?? '5432';

    if (!user || !password || !database) {
        throw new Error(
            'Database configuration is missing. Set DATABASE_URL or POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DB.',
        );
    }

    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
}
