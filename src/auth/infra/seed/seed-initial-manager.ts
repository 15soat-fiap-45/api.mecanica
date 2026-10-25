import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PasswordHasher } from '../../domain/services/password-hasher.js';
import { authUsers } from '../../../infra/database/schema.js';

export async function seedInitialManager(
    db: NodePgDatabase,
    hasher: PasswordHasher,
    password: string,
): Promise<void> {
    const hash = await hasher.hash(password);
    await db.execute(sql`
        INSERT INTO ${authUsers} (email, password_hash, role, status)
        SELECT ${'admin@admin.com'}, ${hash}, ${'GERENTE'}, ${'PENDING_FIRST_ACCESS'}
        WHERE NOT EXISTS (SELECT 1 FROM ${authUsers})
        ON CONFLICT (email) DO NOTHING
    `);
}
