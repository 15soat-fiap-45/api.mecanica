import { buildApp } from './app.js';
import { registryCompositionRoot } from './registry/composition-root.js';
import { DrizzleCustomerRepository } from './infra/database/registry/drizzle-customer-repository.js';
import { DrizzleVehicleRepository } from './infra/database/registry/drizzle-vehicle-repository.js';
import { InMemoryEventBus } from './shared/application/in-memory-event-bus.js';
import { serviceOrderCompositionRoot } from './service-order/composition-root.js';
import { DrizzleServiceOrderRepository } from './infra/database/service-order/drizzle-service-order-repository.js';
import { DrizzleBudgetRepository } from './infra/database/service-order/drizzle-budget-repository.js';

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
