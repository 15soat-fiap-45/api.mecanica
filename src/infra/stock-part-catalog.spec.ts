import { describe, expect, it, vi } from 'vitest';
import { PartCode } from '../shared/domain/part-code.js';
import { PartSupply } from '../stock/domain/part-supply/part-supply.js';
import { UnitOfMeasure } from '../stock/domain/part-supply/value-objects/unit-of-measure.js';
import { StockPartCatalog } from './stock-part-catalog.js';

describe('StockPartCatalog', () => {
    it('exposes description and unit price of a stock part by normalized code', async () => {
        const part = PartSupply.create({
            description: 'Pastilha de freio',
            partCode: PartCode.create('PAST-01'),
            unitOfMeasure: UnitOfMeasure.create('UNIT'),
            unitPriceCents: 8500,
        });
        const findByPartCode = vi.fn(async (code: unknown) =>
            code === 'PAST-01' ? part : null,
        );
        const catalog = new StockPartCatalog({
            findByPartCode,
            findById: vi.fn(),
            save: vi.fn(),
        });

        expect(await catalog.findByPartCode(' past-01 ')).toEqual({
            description: 'Pastilha de freio',
            unitPriceCents: 8500,
        });
        expect(await catalog.findByPartCode('OUTRA')).toBeNull();

        part.deactivate();
        expect(await catalog.findByPartCode('PAST-01')).toBeNull();
    });
});
