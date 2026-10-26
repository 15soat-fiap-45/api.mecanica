import { buildApp } from './app.js';
import { registryCompositionRoot } from './registry/composition-root.js';
import { DrizzleCustomerRepository } from './infra/database/registry/drizzle-customer-repository.js';
import { DrizzleVehicleRepository } from './infra/database/registry/drizzle-vehicle-repository.js';
import { InMemoryEventBus } from './shared/application/in-memory-event-bus.js';
import { serviceOrderCompositionRoot } from './service-order/composition-root.js';
import { DrizzleServiceOrderRepository } from './infra/database/service-order/drizzle-service-order-repository.js';
import { DrizzleBudgetRepository } from './infra/database/service-order/drizzle-budget-repository.js';
import { DrizzleApprovalRequestRepository } from './infra/database/service-order/drizzle-approval-request-repository.js';
import { RegistryVehicleContactLookup } from './infra/registry-vehicle-contact-lookup.js';
import { SmtpEmailSender } from './service-order/infra/email/smtp-email-sender.js';
import { readEmailConfig } from './service-order/infra/email/email.config.js';
import { DrizzleServiceCatalog } from './infra/database/service-order/drizzle-service-catalog.js';

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
    serviceCatalog: new DrizzleServiceCatalog(),
    vehicleContacts: new RegistryVehicleContactLookup(
        new DrizzleVehicleRepository(),
        new DrizzleCustomerRepository(),
    ),
    emailSender: new SmtpEmailSender(emailConfig.smtp),
    frontendUrl: emailConfig.frontendUrl,
    approvalTokenTtlMinutes: emailConfig.ttlMinutes,
});
const app = buildApp({ registry, serviceOrder });
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
