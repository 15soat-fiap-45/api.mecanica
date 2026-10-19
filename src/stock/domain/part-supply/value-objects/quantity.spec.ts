import { describe, expect, it } from 'vitest';
import {
    Quantity,
    InsufficientQuantityException,
    InvalidQuantityException,
} from './quantity.js';

describe('Quantity Value Object', () => {
    describe('Creation and validation', () => {
        it('should create a valid quantity', () => {
            const quantity = Quantity.create(10);
            expect(quantity.value).toBe(10);
        });

        it('should accept zero', () => {
            const quantity = Quantity.create(0);
            expect(quantity.value).toBe(0);
        });

        it('should create zero quantity via Quantity.zero()', () => {
            expect(Quantity.zero().value).toBe(0);
        });

        it('should throw InvalidQuantityException for negative values', () => {
            expect(() => Quantity.create(-1)).toThrow(InvalidQuantityException);
        });

        it('should throw InvalidQuantityException for non-integer values', () => {
            expect(() => Quantity.create(1.5)).toThrow(
                InvalidQuantityException,
            );
        });

        it('should throw InvalidQuantityException for NaN', () => {
            expect(() => Quantity.create(Number.NaN)).toThrow(
                InvalidQuantityException,
            );
        });

        it('should return true for Quantity.isValid with valid input', () => {
            expect(Quantity.isValid(0)).toBe(true);
            expect(Quantity.isValid(42)).toBe(true);
        });

        it('should return false for Quantity.isValid with invalid input', () => {
            expect(Quantity.isValid(-5)).toBe(false);
            expect(Quantity.isValid(2.7)).toBe(false);
            expect(Quantity.isValid(Number.NaN)).toBe(false);
        });
    });

    describe('Operations', () => {
        it('should add two quantities', () => {
            const result = Quantity.create(5).add(Quantity.create(3));
            expect(result.value).toBe(8);
        });

        it('should subtract two quantities', () => {
            const result = Quantity.create(5).subtract(Quantity.create(3));
            expect(result.value).toBe(2);
        });

        it('should allow subtraction resulting in zero', () => {
            const result = Quantity.create(4).subtract(Quantity.create(4));
            expect(result.value).toBe(0);
        });

        it('should throw InsufficientQuantityException when subtraction exceeds available', () => {
            expect(() =>
                Quantity.create(2).subtract(Quantity.create(3)),
            ).toThrow(InsufficientQuantityException);
        });

        it('should not mutate the original quantities', () => {
            const original = Quantity.create(5);
            original.add(Quantity.create(3));
            original.subtract(Quantity.create(2));
            expect(original.value).toBe(5);
        });
    });

    describe('Equality', () => {
        it('should be equal for the same value', () => {
            expect(Quantity.create(7).equals(Quantity.create(7))).toBe(true);
        });

        it('should not be equal for different values or null', () => {
            expect(Quantity.create(7).equals(Quantity.create(8))).toBe(false);
            expect(Quantity.create(7).equals(null)).toBe(false);
        });

        it('should convert to string', () => {
            expect(Quantity.create(10).toString()).toBe('10');
        });
    });
});
