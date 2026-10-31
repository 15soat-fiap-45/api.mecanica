import { describe, expect, it, vi } from 'vitest';
import { Budget } from '../../domain/budget/budget.js';
import type { BudgetRepository } from '../../domain/budget/budget.repository.js';
import { BudgetStatus } from '../../domain/budget/value-objects/budget-status.js';
import { Service } from '../../domain/catalog/service.js';
import {
    ServiceItemNotFoundException,
    ServiceOrder,
} from '../../domain/service-order/service-order.js';
import type { ServiceOrderRepository } from '../../domain/service-order/service-order.repository.js';
import { InMemoryServiceRepository } from '../../infra/persistence/in-memory-catalog-repositories.js';
import { ServiceOrderNotFoundError } from './add-supply-to-service-order.js';
import {
    BudgetNotFoundError,
    GetServiceOrderBudget,
} from './get-service-order-budget.js';
import {
    AddServiceToServiceOrder,
    RemoveServiceFromServiceOrder,
} from './manage-service-order-services.js';
import { ServiceNotFoundError } from './service-use-cases.js';

function ordersWith(order: ServiceOrder | null): ServiceOrderRepository {
    return {
        save: vi.fn(async () => undefined),
        findById: vi.fn(async () => order),
    };
}

function budgetsWith(list: Budget[]): BudgetRepository {
    return {
        save: vi.fn(),
        findById: vi.fn(),
        findByServiceOrderId: vi.fn(async () => list),
    };
}

describe('Add/remove catalog services on a service order', () => {
    const catalog = new InMemoryServiceRepository();
    void catalog.save(
        Service.create({
            id: 'svc-oil',
            name: 'Troca de óleo',
            priceCents: 12000,
            serviceTypeId: 'type-1',
        }),
    );

    it('copies name and price from the catalog and removes them again', async () => {
        const order = ServiceOrder.create({
            id: 'os-1',
            description: 'Revisão',
        });
        const orders = ordersWith(order);

        const added = await new AddServiceToServiceOrder(
            orders,
            catalog,
        ).execute({ serviceOrderId: 'os-1', serviceId: 'svc-oil' });
        expect(added).toEqual({
            serviceOrderId: 'os-1',
            services: [
                {
                    serviceId: 'svc-oil',
                    name: 'Troca de óleo',
                    priceCents: 12000,
                },
            ],
            totalCents: 12000,
        });

        const removed = await new RemoveServiceFromServiceOrder(orders).execute(
            { serviceOrderId: 'os-1', serviceId: 'svc-oil' },
        );
        expect(removed).toEqual({
            serviceOrderId: 'os-1',
            services: [],
            totalCents: 0,
        });
        expect(orders.save).toHaveBeenCalledTimes(2);
    });

    it('fails for unknown orders, catalog services or services not in the order', async () => {
        const order = ServiceOrder.create({
            id: 'os-1',
            description: 'Revisão',
        });
        await expect(
            new AddServiceToServiceOrder(ordersWith(null), catalog).execute({
                serviceOrderId: 'x',
                serviceId: 'svc-oil',
            }),
        ).rejects.toThrow(ServiceOrderNotFoundError);
        await expect(
            new AddServiceToServiceOrder(ordersWith(order), catalog).execute({
                serviceOrderId: 'os-1',
                serviceId: 'missing',
            }),
        ).rejects.toThrow(ServiceNotFoundError);
        await expect(
            new RemoveServiceFromServiceOrder(ordersWith(null)).execute({
                serviceOrderId: 'x',
                serviceId: 'svc-oil',
            }),
        ).rejects.toThrow(ServiceOrderNotFoundError);
        await expect(
            new RemoveServiceFromServiceOrder(ordersWith(order)).execute({
                serviceOrderId: 'os-1',
                serviceId: 'svc-oil',
            }),
        ).rejects.toThrow(ServiceItemNotFoundException);
    });
});

describe('GetServiceOrderBudget', () => {
    const quotedOrder = () => {
        const order = ServiceOrder.create({
            id: 'os-1',
            description: 'Freios',
            vehicleId: 'vehicle-1',
        });
        order.addService({
            serviceId: 'svc-1',
            name: 'Troca de pastilhas',
            priceCents: 18000,
        });
        order.addSupply('PAST-01', 2, {
            description: 'Pastilha',
            unitPriceCents: 8500,
        });
        return order;
    };

    it('details services, parts, subtotals and both the quoted and current totals', async () => {
        const order = quotedOrder();
        const budget = Budget.create({
            id: 'budget-1',
            serviceOrderId: 'os-1',
            totalCents: order.totalCents,
            status: BudgetStatus.create('APPROVED'),
        });
        // Extra supply included during execution, after the approval.
        order.approve();
        order.addSupply('FLUIDO-01', 1, { unitPriceCents: 3000 });

        const result = await new GetServiceOrderBudget(
            ordersWith(order),
            budgetsWith([budget]),
        ).execute({ serviceOrderId: 'os-1' });

        expect(result).toEqual({
            budgetId: 'budget-1',
            serviceOrderId: 'os-1',
            status: 'APPROVED',
            services: [
                {
                    serviceId: 'svc-1',
                    name: 'Troca de pastilhas',
                    priceCents: 18000,
                },
            ],
            parts: [
                {
                    partCode: 'PAST-01',
                    description: 'Pastilha',
                    quantity: 2,
                    unitPriceCents: 8500,
                    totalCents: 17000,
                },
                {
                    partCode: 'FLUIDO-01',
                    description: null,
                    quantity: 1,
                    unitPriceCents: 3000,
                    totalCents: 3000,
                },
            ],
            servicesCents: 18000,
            partsCents: 20000,
            totalCents: 35000,
            currentTotalCents: 38000,
        });
    });

    it('prefers the approved budget over pending or rejected ones', async () => {
        const make = (id: string, status: string) =>
            Budget.create({
                id,
                serviceOrderId: 'os-1',
                totalCents: 1,
                status: BudgetStatus.create(status),
            });
        const result = await new GetServiceOrderBudget(
            ordersWith(quotedOrder()),
            budgetsWith([
                make('b-rejected', 'REJECTED'),
                make('b-pending', 'PENDING'),
                make('b-approved', 'APPROVED'),
            ]),
        ).execute({ serviceOrderId: 'os-1' });
        expect(result.budgetId).toBe('b-approved');
    });

    it('fails when the order or its budget does not exist', async () => {
        await expect(
            new GetServiceOrderBudget(
                ordersWith(null),
                budgetsWith([]),
            ).execute({ serviceOrderId: 'x' }),
        ).rejects.toThrow(ServiceOrderNotFoundError);
        await expect(
            new GetServiceOrderBudget(
                ordersWith(quotedOrder()),
                budgetsWith([]),
            ).execute({ serviceOrderId: 'os-1' }),
        ).rejects.toThrow(BudgetNotFoundError);
    });
});
