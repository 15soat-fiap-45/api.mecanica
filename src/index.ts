import { FirstAccess } from './auth/application/use-cases/first-access.js';
import { LogIn } from './auth/application/use-cases/log-in.js';
import { PreRegisterUser } from './auth/application/use-cases/pre-register-user.js';
import { ResolveAuthenticatedUser } from './auth/application/use-cases/resolve-authenticated-user.js';
import { AuthController } from './auth/infra/http/auth-controller.js';
import { DrizzleUserRepository } from './auth/infra/persistence/drizzle-user-repository.js';
import { Argon2PasswordHasher } from './auth/infra/security/argon2-password-hasher.js';
import { JoseTokenService } from './auth/infra/security/jose-token-service.js';
import { SecurePasswordGenerator } from './auth/infra/security/secure-password-generator.js';
import { seedInitialManager } from './auth/infra/seed/seed-initial-manager.js';
import { buildApp } from './app.js';
import { db } from './infra/database/connection.js';
import { registryCompositionRoot } from './registry/composition-root.js';
import { DrizzleCustomerRepository } from './infra/database/registry/drizzle-customer-repository.js';
import { DrizzleVehicleRepository } from './infra/database/registry/drizzle-vehicle-repository.js';
import { InMemoryEventBus } from './shared/application/in-memory-event-bus.js';
import { serviceOrderCompositionRoot } from './service-order/composition-root.js';
import { DrizzleServiceOrderRepository } from './infra/database/service-order/drizzle-service-order-repository.js';
import { DrizzleBudgetRepository } from './infra/database/service-order/drizzle-budget-repository.js';

const initialManagerPassword = process.env.INITIAL_MANAGER_PASSWORD;
if (!initialManagerPassword || initialManagerPassword.trim() === '') {
    throw new Error(
        'Initial manager configuration is missing. Set INITIAL_MANAGER_PASSWORD.',
    );
}

const jwt = new JoseTokenService(process.env.JWT_SECRET ?? '');
const hasher = new Argon2PasswordHasher();
const users = new DrizzleUserRepository(db);
await seedInitialManager(db, hasher, initialManagerPassword);
const auth = new AuthController(
    new FirstAccess(users, hasher),
    new LogIn(users, hasher, jwt),
    new PreRegisterUser(users, hasher, new SecurePasswordGenerator()),
    new ResolveAuthenticatedUser(users, jwt),
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
const serviceOrder = serviceOrderCompositionRoot(eventBus, {
    serviceOrderRepository: new DrizzleServiceOrderRepository(),
    budgetRepository: new DrizzleBudgetRepository(),
});
const app = buildApp({ registry, serviceOrder });
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

try {
    await app.listen({ host, port });
} catch (error) {
    app.log.error(error);
    process.exitCode = 1;
}
