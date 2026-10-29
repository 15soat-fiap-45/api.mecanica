import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './connection.js';

// Aplica as migrações de ./drizzle usando apenas dependências de produção,
// para rodar no container sem o drizzle-kit.
try {
    await migrate(db, { migrationsFolder: 'drizzle' });
    console.log('Database migrations applied.');
} finally {
    await pool.end();
}
