import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { PartCode } from '../../../shared/domain/part-code.js';
import { PartSupply } from '../../../stock/domain/part-supply/part-supply.js';
import { UnitOfMeasure } from '../../../stock/domain/part-supply/value-objects/unit-of-measure.js';
import { DrizzlePartSupplyRepository } from './drizzle-stock-repositories.js';

// Exercise the real Drizzle SQL builder and row mapping with a fake pg driver.
function databaseWith(
    respond: (sql: string, params: unknown[]) => unknown[][] = () => [],
) {
    const query = vi.fn(
        async (config: { text: string }, params: unknown[] = []) => ({
            rows: respond(config.text, params),
        }),
    );
    return {
        database: drizzle({ query } as unknown as Pool),
        statements: () => query.mock.calls.map(([config]) => config.text),
        query,
    };
}

// peca_insumo columns, then estoque columns, as selected by the repository.
const itemRow = (overrides: { ativo?: boolean } = {}) => [
    1,
    'pec-1',
    'Pastilha',
    'Pastilha de freio',
    '8500',
    overrides.ativo ?? true,
    'PAST-01',
    'UNIT',
    2,
];
const balanceRow = [10, 1, '7.00', '0.00'];

const makePart = () =>
    PartSupply.register({
        id: 'pec-1',
        description: 'Pastilha de freio',
        partCode: PartCode.create('PAST-01'),
        quantity: 7,
        unitOfMeasure: UnitOfMeasure.create('UNIT'),
        unitPriceCents: 8500,
    });

describe('DrizzlePartSupplyRepository', () => {
    it('inserts item, balance and initial movement in one transaction', async () => {
        const { database, statements, query } = databaseWith((sql) =>
            sql.startsWith('insert into "peca_insumo"') ? [[1]] : [],
        );
        await new DrizzlePartSupplyRepository(database).save(makePart());

        expect(statements()[0]).toBe('begin');
        expect(statements()[2]).toContain('insert into "peca_insumo"');
        expect(query.mock.calls[2]?.[1]).toEqual(
            expect.arrayContaining([8500, true, 'PAST-01']),
        );
        expect(statements()[3]).toContain('insert into "estoque"');
        expect(statements()[4]).toContain('insert into "movimento_estoque"');
        expect(statements().at(-1)).toBe('commit');
    });

    it('updates details and the active flag, rolling back when the balance row is missing', async () => {
        const part = PartSupply.create({
            id: 'pec-1',
            description: 'Pastilha',
            partCode: PartCode.create('PAST-01'),
            quantity: 7,
            unitOfMeasure: UnitOfMeasure.create('UNIT'),
            version: 2,
        });
        part.deactivate();
        const { database, statements, query } = databaseWith((sql) => {
            if (sql.startsWith('select')) return [itemRow()];
            if (sql.startsWith('update "peca_insumo"')) return [[1]];
            return [];
        });

        await expect(
            new DrizzlePartSupplyRepository(database).save(part),
        ).rejects.toThrow('Stock balance not found');
        const update = query.mock.calls.find(([c]) =>
            c.text.startsWith('update "peca_insumo"'),
        );
        expect(update?.[0].text).toContain('"ativo" = $');
        expect(update?.[1]).toContain(false);
        expect(statements().at(-1)).toBe('rollback');
        expect(statements()).not.toContain('commit');
    });

    it('lists only active parts ordered by code and maps price and active flag', async () => {
        const { database, statements } = databaseWith(() => [
            [...itemRow(), ...balanceRow],
        ]);
        const repository = new DrizzlePartSupplyRepository(database);
        const [part] = await repository.findAllActive();
        expect(statements()[0]).toContain('where "peca_insumo"."ativo" = $1');
        expect(statements()[0]).toContain('order by "peca_insumo"."part_code"');
        expect(part?.unitPriceCents).toBe(8500);
        expect(part?.active).toBe(true);
        expect(part?.quantity.value).toBe(7);

        const inactive = new DrizzlePartSupplyRepository(
            databaseWith(() => [[...itemRow({ ativo: false }), ...balanceRow]])
                .database,
        );
        expect((await inactive.findByPartCode('PAST-01'))?.active).toBe(false);
    });
});
