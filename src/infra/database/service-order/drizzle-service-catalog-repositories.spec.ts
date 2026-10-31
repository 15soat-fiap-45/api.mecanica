import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { ServiceTypeAlreadyExistsError } from '../../../service-order/application/use-cases/service-type-use-cases.js';
import { Service } from '../../../service-order/domain/catalog/service.js';
import { ServiceType } from '../../../service-order/domain/catalog/service-type.js';
import {
    DrizzleServiceRepository,
    DrizzleServiceTypeRepository,
} from './drizzle-service-catalog-repositories.js';

vi.mock('../connection.js', () => ({ db: {} }));

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
        query,
        call: (index: number) => ({
            sql: query.mock.calls[index]?.[0].text ?? '',
            params: query.mock.calls[index]?.[1],
        }),
    };
}

const uniqueViolation = () =>
    Object.assign(new Error('duplicate key'), { code: '23505' });

describe('DrizzleServiceTypeRepository', () => {
    it('writes, reads and deletes rows of tipo_servico', async () => {
        const { database, call } = databaseWith((sql) =>
            sql.startsWith('select') ? [['type-1', 'Mecânica']] : [],
        );
        const repository = new DrizzleServiceTypeRepository(database);
        const type = ServiceType.create({ id: 'type-1', name: 'Mecânica' });

        await repository.save(type);
        expect(call(0).sql).toContain('insert into "tipo_servico"');
        expect(call(0).params).toEqual(['type-1', 'Mecânica']);

        type.rename('Elétrica');
        await repository.update(type);
        expect(call(1).sql).toContain('update "tipo_servico"');
        expect(call(1).params).toEqual(['Elétrica', 'type-1']);

        expect((await repository.findById('type-1'))?.name).toBe('Mecânica');
        expect((await repository.findByName('Mecânica'))?.id.value).toBe(
            'type-1',
        );
        expect((await repository.findAll()).map((t) => t.name)).toEqual([
            'Mecânica',
        ]);
        expect(call(4).sql).toContain('order by "tipo_servico"."nome"');

        await repository.delete(type.id);
        expect(call(5).sql).toContain('delete from "tipo_servico"');
    });

    it('returns null for missing rows and translates unique violations', async () => {
        const { database } = databaseWith((sql) => {
            if (!sql.startsWith('select')) throw uniqueViolation();
            return [];
        });
        const repository = new DrizzleServiceTypeRepository(database);
        const type = ServiceType.create({ name: 'Mecânica' });

        expect(await repository.findById('missing')).toBeNull();
        expect(await repository.findByName('missing')).toBeNull();
        await expect(repository.save(type)).rejects.toThrow(
            ServiceTypeAlreadyExistsError,
        );
        await expect(repository.update(type)).rejects.toThrow(
            ServiceTypeAlreadyExistsError,
        );
    });

    it('rethrows other database errors', async () => {
        const { database } = databaseWith(() => {
            throw new Error('connection lost');
        });
        const repository = new DrizzleServiceTypeRepository(database);
        const type = ServiceType.create({ name: 'Mecânica' });
        await expect(repository.save(type)).rejects.toThrow('Failed query');
        await expect(repository.update(type)).rejects.toThrow('Failed query');
    });
});

describe('DrizzleServiceRepository', () => {
    const row = ['svc-1', 'Troca de óleo', 'Óleo e filtro', '12000', 'type-1'];

    it('maps services to servico rows with price in cents', async () => {
        const { database, call } = databaseWith((sql) =>
            sql.startsWith('select') ? [row] : [],
        );
        const repository = new DrizzleServiceRepository(database);
        const service = Service.create({
            id: 'svc-1',
            name: 'Troca de óleo',
            description: 'Óleo e filtro',
            priceCents: 12000,
            serviceTypeId: 'type-1',
        });

        await repository.save(service);
        expect(call(0).sql).toContain('insert into "servico"');
        expect(call(0).params).toEqual([
            'svc-1',
            'Troca de óleo',
            'Óleo e filtro',
            12000,
            'type-1',
        ]);
        await repository.update(service);
        expect(call(1).sql).toContain('update "servico"');

        const found = await repository.findById('svc-1');
        expect(found?.priceCents).toBe(12000);
        expect(found?.description).toBe('Óleo e filtro');

        await repository.findAll();
        expect(call(3).sql).not.toContain('where');
        await repository.findAll({ serviceTypeId: 'type-1' });
        expect(call(4).sql).toContain('where "servico"."tipo_servico_id"');
        expect(call(4).params).toEqual(['type-1']);

        expect(await repository.existsWithServiceType('type-1')).toBe(true);
        await repository.delete(service.id);
        expect(call(6).sql).toContain('delete from "servico"');
    });

    it('returns null or false when nothing matches', async () => {
        const { database } = databaseWith(() => []);
        const repository = new DrizzleServiceRepository(database);
        expect(await repository.findById('missing')).toBeNull();
        expect(await repository.existsWithServiceType('type-1')).toBe(false);
    });
});
