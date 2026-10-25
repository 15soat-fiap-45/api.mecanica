import { Argon2PasswordHasher } from './auth/infra/security/argon2-password-hasher.js';
import { seedInitialManager } from './auth/infra/seed/seed-initial-manager.js';
import { buildApp } from './app.js';
import { db } from './infra/database/connection.js';

const initialManagerPassword = process.env.INITIAL_MANAGER_PASSWORD;
if (!initialManagerPassword || initialManagerPassword.trim() === '') {
    throw new Error(
        'Initial manager configuration is missing. Set INITIAL_MANAGER_PASSWORD.',
    );
}

await seedInitialManager(
    db,
    new Argon2PasswordHasher(),
    initialManagerPassword,
);

const app = buildApp();
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

try {
    await app.listen({ host, port });
} catch (error) {
    app.log.error(error);
    process.exitCode = 1;
}
