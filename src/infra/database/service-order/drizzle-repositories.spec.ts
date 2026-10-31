import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { ServiceOrder } from '../../../service-order/domain/service-order/service-order.js';
import { ServiceOrderId } from '../../../service-order/domain/service-order/service-order-id.js';
import { Budget } from '../../../service-order/domain/budget/budget.js';
import { BudgetId } from '../../../service-order/domain/budget/budget-id.js';
import { DrizzleServiceOrderRepository } from './drizzle-service-order-repository.js';
import { DrizzleBudgetRepository } from './drizzle-budget-repository.js';
import { ConcurrentModificationError } from './concurrent-modification-error.js';

vi.mock('../connection.js', () => ({ db: {} }));

// Exercise the real Drizzle SQL builder and row mapping with a fake pg driver.
// These tests do not replace integration tests against PostgreSQL.
function databaseWith(
    respond: (sql: string, params: unknown[]) => unknown[][] = (sql, params) =>
        sql.includes('returning') ? [[params[0]]] : [],
) {
    const query = vi.fn(
        async (config: { text: string }, params: unknown[] = []) => ({
            rows: respond(config.text, params),
        }),
    );
    return {
        database: drizzle({ query } as unknown as Pool),
        query,
        statements: () => query.mock.calls.map(([config]) => config.text),
    };
}

describe('Drizzle ServiceOrderRepository', () => {
    it('commits the order, its items and services atomically, advancing the version after commit', async () => {
        const { database, query, statements } = databaseWith();
        const repository = new DrizzleServiceOrderRepository(database);
        const order = ServiceOrder.register({ description: 'Freios' });
        order.addSupply('PAST-01', 2, {
            description: 'Pastilha',
            unitPriceCents: 8500,
        });
        order.addService({
            serviceId: 'svc-1',
            name: 'Troca de pastilhas',
            priceCents: 18000,
        });

        await repository.save(order);
        expect(statements()[0]).toBe('begin');
        expect(statements()[1]).toContain(
            'insert into "service_order"."orders"',
        );
        expect(statements()[1]).toContain(
            'where "service_order"."orders"."version"',
        );
        expect(statements()[2]).toContain(
            'delete from "service_order"."supply_items"',
        );
        expect(statements()[3]).toContain(
            'insert into "service_order"."supply_items"',
        );
        expect(query.mock.calls[3]?.[1]).toEqual([
            order.id.value,
            'PAST-01',
            2,
            false,
            'Pastilha',
            8500,
        ]);
        expect(statements()[4]).toContain(
            'delete from "service_order"."order_services"',
        );
        expect(statements()[5]).toContain(
            'insert into "service_order"."order_services"',
        );
        expect(query.mock.calls[5]?.[1]).toEqual([
            order.id.value,
            'svc-1',
            'Troca de pastilhas',
            18000,
        ]);
        expect(statements()[6]).toContain(
            'INSERT INTO service_order.order_status_history',
        );
        expect(statements()[7]).toBe('commit');
        expect(order.version).toBe(1);
        expect(order.pullEvents()).toHaveLength(2);

        await repository.save(order);
        expect(order.version).toBe(2);
    });

    it('rolls back the whole aggregate if saving an item fails', async () => {
        const { database, statements } = databaseWith((sql, params) => {
            if (sql.startsWith('insert into "service_order"."supply_items"')) {
                throw new Error('item write failed');
            }
            return sql.includes('returning') ? [[params[0]]] : [];
        });
        const order = ServiceOrder.create({ description: 'Freios' });
        order.addSupply('PAST-01', 2);
        await expect(
            new DrizzleServiceOrderRepository(database).save(order),
        ).rejects.toThrow();
        expect(statements().at(-1)).toBe('rollback');
        expect(statements()).not.toContain('commit');
        expect(order.version).toBe(0);
        expect(order.pullEvents()).toHaveLength(1);
    });

    it('rejects a stale write before replacing any supply items', async () => {
        const { database, statements } = databaseWith(() => []);
        const order = ServiceOrder.create({
            description: 'Freios',
            version: 3,
        });
        await expect(
            new DrizzleServiceOrderRepository(database).save(order),
        ).rejects.toBeInstanceOf(ConcurrentModificationError);
        expect(statements()).toHaveLength(3);
        expect(statements().at(-1)).toBe('rollback');
        expect(order.version).toBe(3);
    });

    it('persists the budget and order transition atomically and rolls back the budget if saving the order fails', async () => {
        const { database: okDb, statements: okStatements } = databaseWith();
        const order = ServiceOrder.create({
            id: 'os-1',
            description: 'Freios',
        });
        const budget = Budget.create({
            id: 'budget-1',
            serviceOrderId: 'os-1',
            totalCents: 12345,
        });
        order.awaitApproval(budget.id.value);

        await new DrizzleServiceOrderRepository(okDb).save(order, budget);
        expect(okStatements()[0]).toBe('begin');
        expect(
            okStatements().some((s) =>
                s.includes('insert into "service_order"."orders"'),
            ),
        ).toBe(true);
        expect(
            okStatements().some((s) =>
                s.includes('insert into "service_order"."budgets"'),
            ),
        ).toBe(true);
        expect(okStatements().at(-1)).toBe('commit');
        expect(order.version).toBe(1);
        expect(budget.version).toBe(1);

        const { database: conflictDb, statements: conflictStatements } =
            databaseWith(() => []);
        const staleOrder = ServiceOrder.create({
            id: 'os-1',
            description: 'Freios',
            version: 2,
        });
        const orphanBudget = Budget.create({
            id: 'budget-2',
            serviceOrderId: 'os-1',
            totalCents: 12345,
        });
        staleOrder.awaitApproval(orphanBudget.id.value);

        await expect(
            new DrizzleServiceOrderRepository(conflictDb).save(
                staleOrder,
                orphanBudget,
            ),
        ).rejects.toBeInstanceOf(ConcurrentModificationError);
        expect(conflictStatements().at(-1)).toBe('rollback');
        expect(conflictStatements()).not.toContain('commit');
        expect(
            conflictStatements().some((s) =>
                s.includes('insert into "service_order"."budgets"'),
            ),
        ).toBe(false);
        expect(staleOrder.version).toBe(2);
        expect(orphanBudget.version).toBe(0);
    });

    it('revokes pending approval requests in the same transaction when an order is cancelled', async () => {
        const { database, statements } = databaseWith();
        const order = ServiceOrder.create({
            id: 'os-1',
            description: 'Freios',
        });
        order.awaitApproval('budget-1');
        order.cancel();

        await new DrizzleServiceOrderRepository(database).save(order);
        expect(
            statements().some((s) =>
                s.includes('update "service_order"."approval_requests"'),
            ),
        ).toBe(true);
        expect(statements().at(-1)).toBe('commit');
    });

    it('rehydrates a consistent order snapshot with items, services and no pending events', async () => {
        const order = ['os-1', 'Freios', 'vehicle-1', 'IN_PROGRESS', 4];
        const past = ['os-1', 'PAST-01', 2, true, 'Pastilha', '8500'];
        const fluid = ['os-1', 'FLUID-01', 1, false, null, '4000'];
        const swap = ['os-1', 'svc-1', 'Troca de pastilhas', '18000'];
        const bleed = ['os-1', 'svc-2', 'Sangria', '6000'];
        // Joining both child tables multiplies rows: items x services.
        const { database, query } = databaseWith(() => [
            [...order, ...past, ...swap],
            [...order, ...past, ...bleed],
            [...order, ...fluid, ...swap],
            [...order, ...fluid, ...bleed],
        ]);
        const rehydrated = await new DrizzleServiceOrderRepository(
            database,
        ).findById(new ServiceOrderId('os-1'));
        expect(query).toHaveBeenCalledTimes(1);
        expect(query.mock.calls[0]?.[1]).toEqual(['os-1']);
        expect(rehydrated?.status.value).toBe('IN_PROGRESS');
        expect(rehydrated?.version).toBe(4);
        expect(rehydrated?.vehicleId).toBe('vehicle-1');
        expect(
            rehydrated?.items.map((item) => ({
                partCode: item.partCode,
                used: item.used,
                description: item.description,
                unitPriceCents: item.unitPriceCents,
            })),
        ).toEqual([
            {
                partCode: 'PAST-01',
                used: true,
                description: 'Pastilha',
                unitPriceCents: 8500,
            },
            {
                partCode: 'FLUID-01',
                used: false,
                description: null,
                unitPriceCents: 4000,
            },
        ]);
        expect(rehydrated?.services.map((item) => item.name)).toEqual([
            'Sangria',
            'Troca de pastilhas',
        ]);
        expect(rehydrated?.totalCents).toBe(17000 + 4000 + 18000 + 6000);
        expect(rehydrated?.pullEvents()).toEqual([]);
    });

    it('rehydrates orders without items or services', async () => {
        const { database } = databaseWith(() => [
            [
                'os-1',
                'Freios',
                null,
                'PENDING',
                1,
                ...Array(6).fill(null),
                ...Array(4).fill(null),
            ],
        ]);
        const order = await new DrizzleServiceOrderRepository(
            database,
        ).findById('os-1');
        expect(order?.items).toEqual([]);
        expect(order?.services).toEqual([]);
        expect(order?.totalCents).toBe(0);
    });

    it('returns null for a missing order', async () => {
        const { database } = databaseWith(() => []);
        expect(
            await new DrizzleServiceOrderRepository(database).findById(
                'missing',
            ),
        ).toBeNull();
    });

    it('returns status history ordered by id with inspection value when available', async () => {
        const t1 = new Date('2026-10-26T10:00:00.000Z');
        const t2 = new Date('2026-10-26T10:15:00.000Z');
        const { database, query } = databaseWith(() => [
            ['PENDING', null, 'user-1', t1],
            ['AWAITING_APPROVAL', '12345', 'user-1', t2],
        ]);
        const history = await new DrizzleServiceOrderRepository(
            database,
        ).findStatusHistory(new ServiceOrderId('os-1'));
        expect(query.mock.calls[0]?.[1]).toEqual(['os-1']);
        expect(history).toEqual([
            {
                status: 'PENDING',
                valueCents: null,
                changedBy: 'user-1',
                recordedAt: t1,
            },
            {
                status: 'AWAITING_APPROVAL',
                valueCents: 12345,
                changedBy: 'user-1',
                recordedAt: t2,
            },
        ]);
    });
});

describe('Drizzle BudgetRepository', () => {
    it('saves integer cents and advances the version', async () => {
        const { database, query } = databaseWith();
        const budget = Budget.create({
            id: 'budget-1',
            serviceOrderId: 'os-1',
            totalCents: 12345,
        });
        await new DrizzleBudgetRepository(database).save(budget);
        expect(query.mock.calls[0]?.[1]).toEqual([
            'budget-1',
            'os-1',
            12345,
            'PENDING',
            1,
            'budget-1',
            'os-1',
            12345,
            'PENDING',
            1,
            0,
        ]);
        expect(budget.version).toBe(1);
    });

    it('keeps the version unchanged after a concurrent write', async () => {
        const { database } = databaseWith(() => []);
        const budget = Budget.create({
            serviceOrderId: 'os-1',
            totalCents: 12345,
            version: 2,
        });
        await expect(
            new DrizzleBudgetRepository(database).save(budget),
        ).rejects.toBeInstanceOf(ConcurrentModificationError);
        expect(budget.version).toBe(2);
    });

    it('finds a budget using a value object id and restores its status/version without events', async () => {
        const { database, query } = databaseWith(() => [
            ['budget-1', 'os-1', '12345', 'APPROVED', 2],
        ]);
        const budget = await new DrizzleBudgetRepository(database).findById(
            new BudgetId('budget-1'),
        );
        expect(query.mock.calls[0]?.[1]).toEqual(['budget-1', 1]);
        expect(budget?.totalCents).toBe(12345);
        expect(budget?.status.value).toBe('APPROVED');
        expect(budget?.version).toBe(2);
        expect(budget?.pullEvents()).toEqual([]);
    });

    it('returns null for a missing budget', async () => {
        const { database } = databaseWith(() => []);
        expect(
            await new DrizzleBudgetRepository(database).findById('missing'),
        ).toBeNull();
    });

    it('returns multiple budgets belonging to the same order', async () => {
        const { database, query } = databaseWith(() => [
            ['budget-1', 'os-1', '100', 'REJECTED', 2],
            ['budget-2', 'os-1', '200', 'PENDING', 1],
        ]);
        const budgets = await new DrizzleBudgetRepository(
            database,
        ).findByServiceOrderId('os-1');
        expect(query.mock.calls[0]?.[1]).toEqual(['os-1']);
        expect(budgets.map((budget) => budget.id.value)).toEqual([
            'budget-1',
            'budget-2',
        ]);
    });
});
