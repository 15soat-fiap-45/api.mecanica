import { Argon2PasswordHasher } from './auth/infra/security/argon2-password-hasher.js';
import { seedInitialManager } from './auth/infra/seed/seed-initial-manager.js';
import { buildApp } from './app.js';
import { db } from './infra/database/connection.js';
import { registryCompositionRoot } from './registry/composition-root.js';
import { DrizzleCustomerRepository } from './infra/database/registry/drizzle-customer-repository.js';
import { DrizzleVehicleRepository } from './infra/database/registry/drizzle-vehicle-repository.js';
import { InMemoryEventBus } from './shared/application/in-memory-event-bus.js';

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

const eventBus = new InMemoryEventBus({
    error: (context, message) => {
        console.error(message, context);
    },
});
const registry = registryCompositionRoot(eventBus, {
    customerRepository: new DrizzleCustomerRepository(),
    vehicleRepository: new DrizzleVehicleRepository(),
});
const app = buildApp({ registry });
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

try {
    await app.listen({ host, port });
} catch (error) {
    app.log.error(error);
    process.exitCode = 1;
}
