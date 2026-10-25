import { describe, expect, it } from 'vitest';
import {
    UnitOfMeasure,
    InvalidUnitOfMeasureException,
} from './unit-of-measure.js';

describe('UnitOfMeasure Value Object', () => {
    describe('Creation', () => {
        it.each(['UNIT', 'PAIR', 'SET', 'LITER', 'KILOGRAM', 'METER'])(
            'should create unit of measure %s',
            (type) => {
                const unit = UnitOfMeasure.create(type);
                expect(unit.value).toBe(type);
            },
        );

        it('should normalize lowercase input', () => {
            const unit = UnitOfMeasure.create('liter');
            expect(unit.value).toBe('LITER');
        });
    });

    describe('Validation and errors', () => {
        it('should throw InvalidUnitOfMeasureException for unknown values', () => {
            expect(() => UnitOfMeasure.create('BOX')).toThrow(
                InvalidUnitOfMeasureException,
            );
            expect(() => UnitOfMeasure.create('')).toThrow(
                InvalidUnitOfMeasureException,
            );
        });

        it('should return true for UnitOfMeasure.isValid with valid input', () => {
            expect(UnitOfMeasure.isValid('UNIT')).toBe(true);
            expect(UnitOfMeasure.isValid('meter')).toBe(true);
        });

        it('should return false for UnitOfMeasure.isValid with invalid input', () => {
            expect(UnitOfMeasure.isValid('GRAM')).toBe(false);
            expect(UnitOfMeasure.isValid('')).toBe(false);
        });
    });

    describe('Equality', () => {
        it('should be equal for the same unit', () => {
            expect(
                UnitOfMeasure.create('PAIR').equals(
                    UnitOfMeasure.create('PAIR'),
                ),
            ).toBe(true);
        });

        it('should not be equal for different units or null', () => {
            expect(
                UnitOfMeasure.create('PAIR').equals(
                    UnitOfMeasure.create('SET'),
                ),
            ).toBe(false);
            expect(UnitOfMeasure.create('PAIR').equals(null)).toBe(false);
        });

        it('should convert to string', () => {
            expect(UnitOfMeasure.create('KILOGRAM').toString()).toBe(
                'KILOGRAM',
            );
        });
    });
});
