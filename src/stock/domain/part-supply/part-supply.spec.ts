import { describe, expect, it } from 'vitest';
import { PartSupply } from './part-supply.js';
import { PartSupplyId } from './part-supply-id.js';
import { PartCode } from './value-objects/part-code.js';
import { InsufficientQuantityException } from './value-objects/quantity.js';
import { UnitOfMeasure } from './value-objects/unit-of-measure.js';

describe('PartSupply Aggregate Root', () => {
    const validCode = PartCode.create('PAST-FREIO-01');
    const validUnit = UnitOfMeasure.create('UNIT');

    const makeProps = (overrides = {}) => ({
        id: 'pec-1',
        description: 'Front brake pad',
        partCode: validCode,
        quantity: 10,
        unitOfMeasure: validUnit,
        ...overrides,
    });

    it('should create part-supply with string or PartSupplyId', () => {
        const part1 = PartSupply.create(makeProps());
        expect(part1.id.value).toBe('pec-1');
        expect(part1.version).toBe(0);
        expect(part1.quantity.value).toBe(10);

        const customId = new PartSupplyId('pec-2');
        const part2 = PartSupply.create(makeProps({ id: customId }));
        expect(part2.id.equals(customId)).toBe(true);
    });

    it('should generate an id when none is provided', () => {
        const part = PartSupply.create(makeProps({ id: undefined }));
        expect(part.id.value).toBeTruthy();
    });

    it('should default quantity to zero when not provided', () => {
        const part = PartSupply.create(makeProps({ quantity: undefined }));
        expect(part.quantity.value).toBe(0);
    });

    it('should record PartSupplyRegistered event on PartSupply.register()', () => {
        const part = PartSupply.register(makeProps());

        const events = part.pullEvents();
        expect(events).toHaveLength(1);
        expect(events[0]?.eventName).toBe('stock.part-supply-registered');
        expect(events[0]?.aggregateId).toBe('pec-1');

        // Events should be cleared after pulling
        expect(part.pullEvents()).toHaveLength(0);
    });

    it('should increase stock and record StockUpdated on registerEntry()', () => {
        const part = PartSupply.create(makeProps());
        part.pullEvents();

        part.registerEntry(5);

        expect(part.quantity.value).toBe(15);
        const events = part.pullEvents();
        expect(events).toHaveLength(1);
        expect(events[0]?.eventName).toBe('stock.stock-updated');
        expect(events[0]).toMatchObject({
            movementType: 'ENTRY',
            movedQuantity: 5,
            previousQuantity: 10,
            currentQuantity: 15,
        });
    });

    it('should decrease stock and record StockUpdated on deduct()', () => {
        const part = PartSupply.create(makeProps());
        part.pullEvents();

        part.deduct(4);

        expect(part.quantity.value).toBe(6);
        const events = part.pullEvents();
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            movementType: 'EXIT',
            movedQuantity: 4,
            previousQuantity: 10,
            currentQuantity: 6,
        });
    });

    it('should throw InsufficientQuantityException when deduct exceeds stock', () => {
        const part = PartSupply.create(makeProps());

        expect(() => part.deduct(11)).toThrow(InsufficientQuantityException);
        expect(part.quantity.value).toBe(10);
        expect(part.pullEvents()).toHaveLength(0);
    });

    it('should compare parts by identity using AggregateRoot.equals()', () => {
        const part1 = PartSupply.create(makeProps());
        const part2 = PartSupply.create(
            makeProps({ description: 'Another description' }),
        );
        const part3 = PartSupply.create(makeProps({ id: 'pec-99' }));

        expect(part1.equals(part2)).toBe(true);
        expect(part1.equals(part3)).toBe(false);
    });
});
