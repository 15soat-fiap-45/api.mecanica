import { describe, expect, it } from 'vitest';
import { InvalidPlateException, Plate } from './plate.js';

describe('Plate Value Object', () => {
    describe('Traditional Brazilian plates', () => {
        it('should create valid traditional plate with hyphen', () => {
            const plate = Plate.create('ABC-1234');
            expect(plate.value).toBe('ABC1234');
            expect(plate.type).toBe('TRADITIONAL');
            expect(plate.isMercosul).toBe(false);
            expect(plate.format()).toBe('ABC-1234');
        });

        it('should create valid traditional plate without hyphen', () => {
            const plate = Plate.create('abc1234');
            expect(plate.value).toBe('ABC1234');
            expect(plate.type).toBe('TRADITIONAL');
            expect(plate.format()).toBe('ABC-1234');
        });
    });

    describe('Mercosul Brazilian plates', () => {
        it('should create valid Mercosul plate', () => {
            const plate = Plate.create('ABC1D23');
            expect(plate.value).toBe('ABC1D23');
            expect(plate.type).toBe('MERCOSUL');
            expect(plate.isMercosul).toBe(true);
            expect(plate.format()).toBe('ABC1D23');
        });

        it('should create valid Mercosul plate with hyphen or lower case', () => {
            const plate = Plate.create('abc-1d23');
            expect(plate.value).toBe('ABC1D23');
            expect(plate.type).toBe('MERCOSUL');
            expect(plate.isMercosul).toBe(true);
            expect(plate.format()).toBe('ABC1D23');
        });
    });

    describe('Validation and errors', () => {
        it('should throw InvalidPlateException for invalid format', () => {
            expect(() => Plate.create('1234567')).toThrow(
                InvalidPlateException,
            );
            expect(() => Plate.create('ABCD-123')).toThrow(
                InvalidPlateException,
            );
            expect(() => Plate.create('ABC123')).toThrow(InvalidPlateException);
        });

        it('should return false for Plate.isValid with invalid input', () => {
            expect(Plate.isValid('invalid')).toBe(false);
            expect(Plate.isValid('')).toBe(false);
        });

        it('should return true for Plate.isValid with valid input', () => {
            expect(Plate.isValid('ABC-1234')).toBe(true);
            expect(Plate.isValid('ABC1D23')).toBe(true);
        });
    });

    describe('Equality and immutability', () => {
        it('should be equal when values match', () => {
            const plate1 = Plate.create('ABC-1234');
            const plate2 = Plate.create('abc1234');
            expect(plate1.equals(plate2)).toBe(true);
        });

        it('should not be equal when values differ', () => {
            const plate1 = Plate.create('ABC-1234');
            const plate2 = Plate.create('ABC-5678');
            expect(plate1.equals(plate2)).toBe(false);
        });
    });
});
