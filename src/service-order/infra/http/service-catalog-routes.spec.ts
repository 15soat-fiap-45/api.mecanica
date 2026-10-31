import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { buildApp } from '../../../app.js';
import { TokenActorResolver } from '../../../infra/token-actor-resolver.js';
import { serviceCatalogUseCases } from '../../catalog-composition.js';
import type { ServiceOrderUseCases } from '../../composition-root.js';
import {
    InMemoryServiceRepository,
    InMemoryServiceTypeRepository,
} from '../persistence/in-memory-catalog-repositories.js';

vi.mock('../../../infra/database/connection.js', () => ({
    db: {},
    pool: { end: vi.fn() },
}));

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
});

const roles = {
    'jwt-gerente': 'GERENTE',
    'jwt-atendente': 'ATENDENTE',
    'jwt-mecanico': 'MECANICO',
} as const;

function setup() {
    const catalog = serviceCatalogUseCases(
        new InMemoryServiceTypeRepository(),
        new InMemoryServiceRepository(),
    );
    // Only the catalog routes are exercised; the order use cases are unused.
    const serviceOrder = {
        catalog,
        actorResolver: new TokenActorResolver({
            verify: async (token) => {
                const role = roles[token as keyof typeof roles];
                return role ? { id: `${role.toLowerCase()}-1`, role } : null;
            },
        }),
    } as unknown as ServiceOrderUseCases;
    const app = buildApp({ serviceOrder });
    apps.push(app);
    const as =
        (token: keyof typeof roles) =>
        (
            method: 'GET' | 'POST' | 'PUT' | 'DELETE',
            url: string,
            payload?: object,
        ) =>
            app.inject({
                method,
                url,
                headers: { authorization: `Bearer ${token}` },
                ...(payload ? { payload } : {}),
            });
    return {
        app,
        manager: as('jwt-gerente'),
        attendant: as('jwt-atendente'),
    };
}

describe('Service catalog HTTP routes', () => {
    it('lets the manager run the full CRUD of service types and services', async () => {
        const { manager } = setup();
        const type = await manager('POST', '/service-types', {
            name: 'Mecânica',
        });
        expect(type.statusCode).toBe(201);
        const typeId = type.json().id as string;

        const created = await manager('POST', '/services', {
            name: 'Troca de óleo',
            description: 'Óleo e filtro',
            priceCents: 12000,
            serviceTypeId: typeId,
        });
        expect(created.statusCode).toBe(201);
        const service = created.json();
        expect(service).toEqual({
            id: expect.any(String),
            name: 'Troca de óleo',
            description: 'Óleo e filtro',
            priceCents: 12000,
            serviceType: { id: typeId, name: 'Mecânica' },
        });

        expect((await manager('GET', '/service-types')).json()).toEqual([
            { id: typeId, name: 'Mecânica' },
        ]);
        expect(
            (await manager('GET', `/service-types/${typeId}`)).json(),
        ).toEqual({ id: typeId, name: 'Mecânica' });
        expect(
            (await manager('GET', `/services?serviceTypeId=${typeId}`)).json(),
        ).toEqual([service]);
        expect(
            (await manager('GET', `/services/${service.id}`)).json(),
        ).toEqual(service);

        const renamed = await manager('PUT', `/service-types/${typeId}`, {
            name: 'Mecânica geral',
        });
        expect(renamed.json()).toEqual({ id: typeId, name: 'Mecânica geral' });

        const updated = await manager('PUT', `/services/${service.id}`, {
            name: 'Troca de óleo sintético',
            priceCents: 15000,
            serviceTypeId: typeId,
        });
        expect(updated.statusCode).toBe(200);
        expect(updated.json()).toMatchObject({
            priceCents: 15000,
            description: null,
            serviceType: { name: 'Mecânica geral' },
        });

        expect(
            (await manager('DELETE', `/service-types/${typeId}`)).statusCode,
        ).toBe(409);
        expect(
            (await manager('DELETE', `/services/${service.id}`)).statusCode,
        ).toBe(204);
        expect(
            (await manager('DELETE', `/service-types/${typeId}`)).statusCode,
        ).toBe(204);
        expect((await manager('GET', '/services')).json()).toEqual([]);
        expect(
            (await manager('GET', `/services/${service.id}`)).statusCode,
        ).toBe(404);
    });

    it('maps conflicts, missing references and invalid payloads to HTTP errors', async () => {
        const { manager } = setup();
        await manager('POST', '/service-types', { name: 'Mecânica' });
        expect(
            (await manager('POST', '/service-types', { name: 'Mecânica' }))
                .statusCode,
        ).toBe(409);
        expect(
            (
                await manager('POST', '/services', {
                    name: 'Troca de óleo',
                    priceCents: 12000,
                    serviceTypeId: 'missing',
                })
            ).statusCode,
        ).toBe(404);
        for (const payload of [
            { name: '', priceCents: 1, serviceTypeId: 't' },
            { name: 'X', priceCents: -1, serviceTypeId: 't' },
            { name: 'X', priceCents: 1.5, serviceTypeId: 't' },
            { name: 'X', priceCents: 1, serviceTypeId: 't', extra: true },
        ]) {
            expect(
                (await manager('POST', '/services', payload)).statusCode,
            ).toBe(400);
        }
        expect(
            (await manager('PUT', '/service-types/missing', { name: 'X' }))
                .statusCode,
        ).toBe(404);
    });

    it('allows any authenticated user to read but only the manager to change the catalog', async () => {
        const { app, manager, attendant } = setup();
        const type = (
            await manager('POST', '/service-types', { name: 'Mecânica' })
        ).json();

        expect(
            (await app.inject({ method: 'GET', url: '/services' })).statusCode,
        ).toBe(401);
        expect((await attendant('GET', '/services')).statusCode).toBe(200);
        expect((await attendant('GET', '/service-types')).statusCode).toBe(200);
        for (const [method, url, payload] of [
            ['POST', '/service-types', { name: 'Elétrica' }],
            ['PUT', `/service-types/${type.id}`, { name: 'Elétrica' }],
            ['DELETE', `/service-types/${type.id}`, undefined],
            [
                'POST',
                '/services',
                { name: 'X', priceCents: 1, serviceTypeId: type.id },
            ],
            [
                'PUT',
                '/services/any',
                { name: 'X', priceCents: 1, serviceTypeId: type.id },
            ],
            ['DELETE', '/services/any', undefined],
        ] as const) {
            expect((await attendant(method, url, payload)).statusCode).toBe(
                403,
            );
        }
    });

    it('publishes request and response examples that match their schemas', async () => {
        const { app } = setup();
        const documented: z.ZodType[] = [];
        app.addHook('onRoute', ({ schema, method }) => {
            if (method === 'HEAD' || !schema?.tags?.includes('Service catalog'))
                return;
            for (const candidate of [
                schema.body,
                ...Object.values(schema.response ?? {}),
            ]) {
                if (candidate instanceof z.ZodType) documented.push(candidate);
            }
        });
        expect(
            (await app.inject({ method: 'GET', url: '/docs/json' })).statusCode,
        ).toBe(200);
        expect(documented.length).toBeGreaterThan(0);
        for (const schema of documented) {
            const target =
                schema instanceof z.ZodArray ? schema.element : schema;
            const examples = (target as z.ZodType).meta()?.examples;
            expect(Array.isArray(examples), 'missing examples').toBe(true);
            for (const example of examples as unknown[]) {
                expect(
                    (target as z.ZodType).safeParse(example).success,
                    JSON.stringify(example),
                ).toBe(true);
            }
        }
    });
});
