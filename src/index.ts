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
import { DrizzleApprovalRequestRepository } from './infra/database/service-order/drizzle-approval-request-repository.js';
import { RegistryVehicleContactLookup } from './infra/registry-vehicle-contact-lookup.js';
import { TokenActorResolver } from './infra/token-actor-resolver.js';
import { SmtpEmailSender } from './service-order/infra/email/smtp-email-sender.js';
import { readEmailConfig } from './service-order/infra/email/email.config.js';
import { businessIntelligenceCompositionRoot } from './business-intelligence/composition-root.js';
import { ReorderPointRestockPolicy } from './business-intelligence/domain/restock-cycle/restock-cycle-policy.js';
import { DrizzleServiceOrderTimelineRepository } from './infra/database/business-intelligence/drizzle-service-order-timeline-repository.js';
import { DrizzleRestockCycleRepository } from './infra/database/business-intelligence/drizzle-restock-cycle-repository.js';
import { TokenBiAccessGuard } from './infra/token-bi-access-guard.js';

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
const resolveAuthenticatedUser = new ResolveAuthenticatedUser(users, jwt);
const auth = new AuthController(
    new FirstAccess(users, hasher),
    new LogIn(users, hasher, jwt),
    new PreRegisterUser(users, hasher, new SecurePasswordGenerator()),
    resolveAuthenticatedUser,
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
const emailConfig = readEmailConfig();
const approvalRequests = new DrizzleApprovalRequestRepository();
const serviceOrder = serviceOrderCompositionRoot(eventBus, {
    serviceOrderRepository: new DrizzleServiceOrderRepository(),
    budgetRepository: new DrizzleBudgetRepository(),
    approvalRequestRepository: approvalRequests,
    vehicleContacts: new RegistryVehicleContactLookup(
        new DrizzleVehicleRepository(),
        new DrizzleCustomerRepository(),
    ),
    actorResolver: new TokenActorResolver(resolveAuthenticatedUser),
    emailSender: new SmtpEmailSender(emailConfig.smtp),
    frontendUrl: emailConfig.frontendUrl,
    approvalTokenTtlMinutes: emailConfig.ttlMinutes,
});
const reorderPoint = Number(process.env.BI_REORDER_POINT ?? 0);
const businessIntelligence = businessIntelligenceCompositionRoot(eventBus, {
    timelineRepository: new DrizzleServiceOrderTimelineRepository(),
    restockCycleRepository: new DrizzleRestockCycleRepository(),
    restockPolicy: new ReorderPointRestockPolicy(
        Number.isInteger(reorderPoint) && reorderPoint >= 0 ? reorderPoint : 0,
    ),
    accessGuard: new TokenBiAccessGuard(resolveAuthenticatedUser),
});
const app = buildApp({ registry, auth, serviceOrder, businessIntelligence });
let expiryInterval: ReturnType<typeof setInterval> | undefined;
app.addHook('onClose', async () => {
    if (expiryInterval) clearInterval(expiryInterval);
});
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

try {
    await app.listen({ host, port });
    const expire = async () => {
        try {
            await approvalRequests.expirePending(new Date());
        } catch (error) {
            app.log.error(error);
        }
    };
    await expire();
    expiryInterval = setInterval(() => void expire(), 60_000);
    expiryInterval.unref();
} catch (error) {
    app.log.error(error);
    process.exitCode = 1;
}
