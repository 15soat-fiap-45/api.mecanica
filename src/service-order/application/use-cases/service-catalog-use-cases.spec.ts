import { describe, expect, it } from 'vitest';
import { serviceCatalogUseCases } from '../../catalog-composition.js';
import {
    InMemoryServiceRepository,
    InMemoryServiceTypeRepository,
} from '../../infra/persistence/in-memory-catalog-repositories.js';
import { ServiceNotFoundError } from './service-use-cases.js';
import {
    ServiceTypeAlreadyExistsError,
    ServiceTypeInUseConflictError,
    ServiceTypeNotFoundError,
} from './service-type-use-cases.js';

function setup() {
    const types = new InMemoryServiceTypeRepository();
    const services = new InMemoryServiceRepository();
    return {
        types,
        services,
        catalog: serviceCatalogUseCases(types, services),
    };
}

describe('Service type use cases', () => {
    it('registers, lists, finds, renames and deletes service types', async () => {
        const { catalog } = setup();
        const mechanics = await catalog.registerServiceType.execute({
            name: ' Mecânica ',
        });
        await catalog.registerServiceType.execute({ name: 'Elétrica' });

        expect(mechanics.name).toBe('Mecânica');
        expect(
            (await catalog.listServiceTypes.execute()).map((t) => t.name),
        ).toEqual(['Elétrica', 'Mecânica']);
        expect(
            await catalog.findServiceType.execute({ id: mechanics.id }),
        ).toEqual(mechanics);

        const renamed = await catalog.updateServiceType.execute({
            id: mechanics.id,
            name: 'Mecânica geral',
        });
        expect(renamed).toEqual({ id: mechanics.id, name: 'Mecânica geral' });

        await catalog.deleteServiceType.execute({ id: mechanics.id });
        await expect(
            catalog.findServiceType.execute({ id: mechanics.id }),
        ).rejects.toThrow(ServiceTypeNotFoundError);
    });

    it('rejects duplicated names on register and rename', async () => {
        const { catalog } = setup();
        await catalog.registerServiceType.execute({ name: 'Mecânica' });
        const other = await catalog.registerServiceType.execute({
            name: 'Elétrica',
        });

        await expect(
            catalog.registerServiceType.execute({ name: 'Mecânica' }),
        ).rejects.toThrow(ServiceTypeAlreadyExistsError);
        await expect(
            catalog.updateServiceType.execute({
                id: other.id,
                name: 'Mecânica',
            }),
        ).rejects.toThrow(ServiceTypeAlreadyExistsError);
        await expect(
            catalog.updateServiceType.execute({
                id: other.id,
                name: 'Elétrica',
            }),
        ).resolves.toEqual(other);
    });

    it('returns not found for unknown ids and refuses to delete a type in use', async () => {
        const { catalog } = setup();
        for (const run of [
            () => catalog.updateServiceType.execute({ id: 'x', name: 'Y' }),
            () => catalog.deleteServiceType.execute({ id: 'x' }),
        ]) {
            await expect(run()).rejects.toThrow(ServiceTypeNotFoundError);
        }

        const type = await catalog.registerServiceType.execute({
            name: 'Mecânica',
        });
        await catalog.registerService.execute({
            name: 'Troca de óleo',
            priceCents: 12000,
            serviceTypeId: type.id,
        });
        await expect(
            catalog.deleteServiceType.execute({ id: type.id }),
        ).rejects.toThrow(ServiceTypeInUseConflictError);
    });
});

describe('Service use cases', () => {
    it('registers, lists (optionally by type), finds, updates and deletes services', async () => {
        const { catalog } = setup();
        const mechanics = await catalog.registerServiceType.execute({
            name: 'Mecânica',
        });
        const tires = await catalog.registerServiceType.execute({
            name: 'Pneus',
        });
        const oil = await catalog.registerService.execute({
            name: 'Troca de óleo',
            description: 'Óleo e filtro',
            priceCents: 12000,
            serviceTypeId: mechanics.id,
        });
        await catalog.registerService.execute({
            name: 'Alinhamento',
            priceCents: 8000,
            serviceTypeId: tires.id,
        });

        expect(oil).toEqual({
            id: expect.any(String),
            name: 'Troca de óleo',
            description: 'Óleo e filtro',
            priceCents: 12000,
            serviceType: { id: mechanics.id, name: 'Mecânica' },
        });
        expect(
            (await catalog.listServices.execute({})).map((s) => s.name),
        ).toEqual(['Alinhamento', 'Troca de óleo']);
        expect(
            await catalog.listServices.execute({ serviceTypeId: tires.id }),
        ).toEqual([
            expect.objectContaining({
                name: 'Alinhamento',
                serviceType: { id: tires.id, name: 'Pneus' },
            }),
        ]);
        expect(await catalog.findService.execute({ id: oil.id })).toEqual(oil);

        const updated = await catalog.updateService.execute({
            id: oil.id,
            name: 'Troca de óleo sintético',
            priceCents: 15000,
            serviceTypeId: tires.id,
        });
        expect(updated).toMatchObject({
            name: 'Troca de óleo sintético',
            description: null,
            priceCents: 15000,
            serviceType: { id: tires.id, name: 'Pneus' },
        });

        await catalog.deleteService.execute({ id: oil.id });
        await expect(
            catalog.findService.execute({ id: oil.id }),
        ).rejects.toThrow(ServiceNotFoundError);
    });

    it('requires an existing service type and an existing service', async () => {
        const { catalog, services } = setup();
        await expect(
            catalog.registerService.execute({
                name: 'Troca de óleo',
                priceCents: 12000,
                serviceTypeId: 'missing',
            }),
        ).rejects.toThrow(ServiceTypeNotFoundError);
        expect(services.items.size).toBe(0);

        const type = await catalog.registerServiceType.execute({
            name: 'Mecânica',
        });
        const service = await catalog.registerService.execute({
            name: 'Troca de óleo',
            priceCents: 12000,
            serviceTypeId: type.id,
        });
        await expect(
            catalog.updateService.execute({
                id: service.id,
                name: 'Troca de óleo',
                priceCents: 12000,
                serviceTypeId: 'missing',
            }),
        ).rejects.toThrow(ServiceTypeNotFoundError);

        for (const run of [
            () => catalog.findService.execute({ id: 'x' }),
            () => catalog.deleteService.execute({ id: 'x' }),
            () =>
                catalog.updateService.execute({
                    id: 'x',
                    name: 'Y',
                    priceCents: 1,
                    serviceTypeId: type.id,
                }),
        ]) {
            await expect(run()).rejects.toThrow(ServiceNotFoundError);
        }
    });
});
