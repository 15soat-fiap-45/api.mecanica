import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { buildApp } from '../../../app.js';
import { stockCompositionRoot } from '../../../composition-root.js';
import { TokenActorResolver } from '../../../infra/token-actor-resolver.js';
import { InMemoryEventBus } from '../../../shared/application/in-memory-event-bus.js';
import type { PartCode } from '../../../shared/domain/part-code.js';
import type { PartSupply } from '../../domain/part-supply/part-supply.js';
import type { PartSupplyId } from '../../domain/part-supply/part-supply-id.js';
import type { PartSupplyRepository } from '../../domain/part-supply/part-supply.repository.js';
import type { SupplyReservation } from '../../domain/supply-reservation/supply-reservation.js';
import type { SupplyReservationRepository } from '../../domain/supply-reservation/supply-reservation.repository.js';

vi.mock('../../../infra/database/connection.js', () => ({
    db: {},
    pool: { end: vi.fn() },
}));

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
});

const idOf = (id: { value: string } | string) =>
    typeof id === 'string' ? id : id.value;

function setup() {
    const parts = new Map<string, PartSupply>();
    const reservations = new Map<string, SupplyReservation>();
    const partRepository: PartSupplyRepository = {
        save: async (part) => {
            parts.set(part.id.value, part);
            part.pullEvents();
        },
        findById: async (id: PartSupplyId | string) =>
            parts.get(idOf(id)) ?? null,
        findByPartCode: async (code: PartCode | string) =>
            [...parts.values()].find((p) => p.partCode.value === idOf(code)) ??
            null,
        findAllActive: async () =>
            [...parts.values()]
                .filter((p) => p.active)
                .sort((a, b) =>
                    a.partCode.value.localeCompare(b.partCode.value),
                ),
    };
    const reservationRepository: SupplyReservationRepository = {
        save: async (reservation) => {
            reservations.set(reservation.id.value, reservation);
        },
        findById: async (id) => reservations.get(idOf(id)) ?? null,
        findByPartSupplyId: async (id) =>
            [...reservations.values()].filter(
                (r) => r.partSupplyId.value === idOf(id),
            ),
        findByServiceOrderId: async (id) =>
            [...reservations.values()].filter((r) => r.serviceOrderId === id),
        findByServiceOrderIdAndPartSupply: async (orderId, partId) =>
            [...reservations.values()].find(
                (r) =>
                    r.serviceOrderId === orderId &&
                    r.partSupplyId.value === idOf(partId),
            ) ?? null,
    };
    const roles = {
        'jwt-gerente': 'GERENTE',
        'jwt-mecanico': 'MECANICO',
        'jwt-atendente': 'ATENDENTE',
    } as const;
    const stock = stockCompositionRoot(
        new InMemoryEventBus({ error: vi.fn() }),
        {
            partSupplyRepository: partRepository,
            reservationRepository,
            actorResolver: new TokenActorResolver({
                verify: async (token) => {
                    const role = roles[token as keyof typeof roles];
                    return role ? { id: `${role}-1`, role } : null;
                },
            }),
        },
    );
    const app = buildApp({ stock });
    apps.push(app);
    const as =
        (token: keyof typeof roles | null) =>
        (
            method: 'GET' | 'POST' | 'PUT' | 'DELETE',
            url: string,
            payload?: object,
        ) =>
            app.inject({
                method,
                url,
                ...(token
                    ? { headers: { authorization: `Bearer ${token}` } }
                    : {}),
                ...(payload ? { payload } : {}),
            });
    return {
        app,
        parts,
        manager: as('jwt-gerente'),
        mechanic: as('jwt-mecanico'),
        anonymous: as(null),
    };
}

const brakePad = {
    description: 'Pastilha de freio dianteira',
    partCode: 'PAST-FREIO-01',
    quantity: 10,
    unitOfMeasure: 'UNIT',
    unitPriceCents: 8500,
};

describe('Stock part/supply HTTP routes', () => {
    it('registers, lists, details, updates and deactivates parts', async () => {
        const { manager, mechanic } = setup();
        const created = await manager('POST', '/stock/parts', brakePad);
        expect(created.statusCode).toBe(201);
        const id = created.json().id as string;
        await manager('POST', '/stock/parts', {
            ...brakePad,
            description: 'Óleo 5W30',
            partCode: 'OLEO-5W30',
            unitOfMeasure: 'LITER',
            unitPriceCents: 4500,
        });

        const listed = await mechanic('GET', '/stock/parts');
        expect(listed.statusCode).toBe(200);
        expect(
            listed.json().map((p: { partCode: string }) => p.partCode),
        ).toEqual(['OLEO-5W30', 'PAST-FREIO-01']);

        const detail = await mechanic('GET', '/stock/parts/past-freio-01');
        expect(detail.statusCode).toBe(200);
        expect(detail.json()).toEqual({ id, ...brakePad });

        const entry = await manager('POST', '/stock/entries', {
            partCode: 'PAST-FREIO-01',
            quantity: 5,
        });
        expect(entry.json().quantity).toBe(15);

        const updated = await manager('PUT', '/stock/parts/PAST-FREIO-01', {
            description: 'Pastilha cerâmica',
            unitOfMeasure: 'SET',
            unitPriceCents: 12990,
        });
        expect(updated.statusCode).toBe(200);
        expect(updated.json()).toEqual({
            id,
            description: 'Pastilha cerâmica',
            partCode: 'PAST-FREIO-01',
            quantity: 15,
            unitOfMeasure: 'SET',
            unitPriceCents: 12990,
        });

        const deleted = await manager('DELETE', '/stock/parts/PAST-FREIO-01');
        expect(deleted.statusCode).toBe(204);
        expect(
            (await mechanic('GET', '/stock/parts/PAST-FREIO-01')).statusCode,
        ).toBe(404);
        expect((await mechanic('GET', '/stock/parts')).json()).toHaveLength(1);
        expect(
            (await manager('DELETE', '/stock/parts/PAST-FREIO-01')).statusCode,
        ).toBe(404);
        expect(
            (await manager('POST', '/stock/parts', brakePad)).statusCode,
        ).toBe(409);
    });

    it('refuses to deactivate a part reserved for a service order until the reservation is cancelled', async () => {
        const { manager } = setup();
        await manager('POST', '/stock/parts', brakePad);
        const reserved = await manager('POST', '/stock/reservations', {
            serviceOrderId: 'os-1',
            partCode: 'PAST-FREIO-01',
            quantity: 3,
        });
        expect(reserved.statusCode).toBe(201);
        expect(reserved.json().availableQuantity).toBe(7);
        expect(
            (await manager('GET', '/stock/parts/PAST-FREIO-01')).json()
                .quantity,
        ).toBe(7);

        expect(
            (await manager('DELETE', '/stock/parts/PAST-FREIO-01')).statusCode,
        ).toBe(409);

        const cancelled = await manager(
            'POST',
            '/stock/reservations/os-1/cancel',
        );
        expect(cancelled.statusCode).toBe(200);
        expect(
            (await manager('DELETE', '/stock/parts/PAST-FREIO-01')).statusCode,
        ).toBe(204);
    });

    it('validates payloads and enforces authentication and permissions', async () => {
        const { manager, mechanic, anonymous } = setup();
        await manager('POST', '/stock/parts', brakePad);

        expect((await anonymous('GET', '/stock/parts')).statusCode).toBe(401);
        expect(
            (await anonymous('GET', '/stock/parts/PAST-FREIO-01')).statusCode,
        ).toBe(401);
        for (const [method, url, payload] of [
            ['POST', '/stock/parts', { ...brakePad, partCode: 'NOVA-01' }],
            [
                'PUT',
                '/stock/parts/PAST-FREIO-01',
                { description: 'X', unitOfMeasure: 'UNIT', unitPriceCents: 1 },
            ],
            ['DELETE', '/stock/parts/PAST-FREIO-01', undefined],
        ] as const) {
            expect((await mechanic(method, url, payload)).statusCode).toBe(403);
        }
        for (const payload of [
            { description: '', unitOfMeasure: 'UNIT', unitPriceCents: 1 },
            { description: 'X', unitOfMeasure: 'BOX', unitPriceCents: 1 },
            { description: 'X', unitOfMeasure: 'UNIT', unitPriceCents: -1 },
            {
                description: 'X',
                unitOfMeasure: 'UNIT',
                unitPriceCents: 1,
                quantity: 99,
            },
        ]) {
            expect(
                (await manager('PUT', '/stock/parts/PAST-FREIO-01', payload))
                    .statusCode,
            ).toBe(400);
        }
        expect(
            (
                await manager('PUT', '/stock/parts/NAO-EXISTE', {
                    description: 'X',
                    unitOfMeasure: 'UNIT',
                    unitPriceCents: 1,
                })
            ).statusCode,
        ).toBe(404);
    });

    it('publishes request and response examples that match their schemas', async () => {
        const { app } = setup();
        const documented: z.ZodType[] = [];
        app.addHook('onRoute', ({ schema, method }) => {
            if (method === 'HEAD' || !schema?.tags?.includes('Stock')) return;
            for (const candidate of [
                schema.body,
                schema.params,
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
                schema instanceof z.ZodArray
                    ? (schema.element as z.ZodType)
                    : schema;
            const examples = target.meta()?.examples;
            expect(Array.isArray(examples), 'missing examples').toBe(true);
            for (const example of examples as unknown[]) {
                expect(
                    target.safeParse(example).success,
                    JSON.stringify(example),
                ).toBe(true);
            }
        }
    });
});
