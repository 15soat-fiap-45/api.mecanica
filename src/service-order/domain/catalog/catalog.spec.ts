import { describe, expect, it } from 'vitest';
import { InvalidCatalogEntryException } from './catalog-rules.js';
import { Service } from './service.js';
import { ServiceId } from './service-id.js';
import { ServiceType } from './service-type.js';
import { ServiceTypeId } from './service-type-id.js';

describe('ServiceType', () => {
    it('trims the name and generates an id when none is given', () => {
        const type = ServiceType.create({ name: '  Mecânica  ' });
        expect(type.name).toBe('Mecânica');
        expect(type.id.value).toMatch(/^[0-9a-f-]{36}$/);
        expect(
            ServiceType.create({ id: new ServiceTypeId('t-1'), name: 'X' }).id
                .value,
        ).toBe('t-1');
    });

    it('renames and rejects empty or too long names', () => {
        const type = ServiceType.create({ id: 't-1', name: 'Mecânica' });
        type.rename('Elétrica');
        expect(type.name).toBe('Elétrica');
        for (const name of ['', '   ', 'x'.repeat(51)]) {
            expect(() => type.rename(name)).toThrow(
                InvalidCatalogEntryException,
            );
        }
        expect(type.name).toBe('Elétrica');
    });
});

describe('Service', () => {
    const props = {
        id: 'svc-1',
        name: ' Troca de óleo ',
        description: ' Drenagem e reposição ',
        priceCents: 12000,
        serviceTypeId: 'type-1',
    };

    it('normalizes name and description and keeps the price in cents', () => {
        const service = Service.create(props);
        expect(service.id).toEqual(new ServiceId('svc-1'));
        expect(service.name).toBe('Troca de óleo');
        expect(service.description).toBe('Drenagem e reposição');
        expect(service.priceCents).toBe(12000);
        expect(service.serviceTypeId.value).toBe('type-1');
        expect(
            Service.create({ ...props, description: '  ' }).description,
        ).toBeNull();
        expect(
            Service.create({ ...props, description: undefined }).description,
        ).toBeNull();
    });

    it('rejects invalid name, description or price', () => {
        for (const invalid of [
            { name: '' },
            { name: 'x'.repeat(101) },
            { description: 'x'.repeat(501) },
            { priceCents: -1 },
            { priceCents: 10.5 },
            { priceCents: Number.NaN },
        ]) {
            expect(() => Service.create({ ...props, ...invalid })).toThrow(
                InvalidCatalogEntryException,
            );
        }
    });

    it('updates all fields atomically, leaving it unchanged when invalid', () => {
        const service = Service.create(props);
        service.update({
            name: 'Alinhamento',
            description: null,
            priceCents: 8000,
            serviceTypeId: new ServiceTypeId('type-2'),
        });
        expect(service.name).toBe('Alinhamento');
        expect(service.description).toBeNull();
        expect(service.priceCents).toBe(8000);
        expect(service.serviceTypeId.value).toBe('type-2');

        expect(() =>
            service.update({
                name: 'Balanceamento',
                priceCents: -5,
                serviceTypeId: 'type-3',
            }),
        ).toThrow(InvalidCatalogEntryException);
        expect(service.name).toBe('Alinhamento');
        expect(service.serviceTypeId.value).toBe('type-2');
    });
});
