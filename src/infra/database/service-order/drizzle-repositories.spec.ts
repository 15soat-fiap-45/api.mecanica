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
    it('commits the order and its items atomically, advancing the version after commit', async () => {
        const { database, query, statements } = databaseWith();
        const repository = new DrizzleServiceOrderRepository(database);
        const order = ServiceOrder.register({ description: 'Freios' });
        order.addSupply('PAST-01', 2);

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
        ]);
        expect(statements()[4]).toBe('commit');
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

    it('rehydrates a consistent order snapshot with used items and no pending events', async () => {
        const { database, query } = databaseWith(() => [
            [
                'os-1',
                'Freios',
                'vehicle-1',
                'IN_PROGRESS',
                4,
                'os-1',
                'PAST-01',
                2,
                true,
            ],
            [
                'os-1',
                'Freios',
                'vehicle-1',
                'IN_PROGRESS',
                4,
                'os-1',
                'FLUID-01',
                1,
                false,
            ],
        ]);
        const order = await new DrizzleServiceOrderRepository(
            database,
        ).findById(new ServiceOrderId('os-1'));
        expect(query).toHaveBeenCalledTimes(1);
        expect(query.mock.calls[0]?.[1]).toEqual(['os-1']);
        expect(order?.status.value).toBe('IN_PROGRESS');
        expect(order?.version).toBe(4);
        expect(order?.vehicleId).toBe('vehicle-1');
        expect(
            order?.items.map((item) => ({
                partCode: item.partCode,
                used: item.used,
            })),
        ).toEqual([
            { partCode: 'PAST-01', used: true },
            { partCode: 'FLUID-01', used: false },
        ]);
        expect(order?.pullEvents()).toEqual([]);
    });

    it('rehydrates orders without items', async () => {
        const { database } = databaseWith(() => [
            ['os-1', 'Freios', null, 'PENDING', 1, null, null, null, null],
        ]);
        const order = await new DrizzleServiceOrderRepository(
            database,
        ).findById('os-1');
        expect(order?.items).toEqual([]);
    });

    it('returns null for a missing order', async () => {
        const { database } = databaseWith(() => []);
        expect(
            await new DrizzleServiceOrderRepository(database).findById(
                'missing',
            ),
        ).toBeNull();
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
