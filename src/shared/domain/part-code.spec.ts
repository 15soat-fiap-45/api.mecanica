import { describe, expect, it } from 'vitest';
import { PartCode, InvalidPartCodeException } from './part-code.js';

describe('PartCode Value Object', () => {
    describe('Creation and normalization', () => {
        it('should create a valid part code', () => {
            const code = PartCode.create('PAST-FREIO-01');
            expect(code.value).toBe('PAST-FREIO-01');
        });

        it('should normalize lowercase and surrounding spaces to uppercase', () => {
            const code = PartCode.create('  abc-123  ');
            expect(code.value).toBe('ABC-123');
        });

        it('should accept the minimum length of 3 characters', () => {
            expect(PartCode.create('A1B').value).toBe('A1B');
        });
    });

    describe('Validation and errors', () => {
        it('should throw InvalidPartCodeException for too short codes', () => {
            expect(() => PartCode.create('AB')).toThrow(
                InvalidPartCodeException,
            );
            expect(() => PartCode.create('')).toThrow(InvalidPartCodeException);
        });

        it('should throw InvalidPartCodeException for codes starting with a hyphen', () => {
            expect(() => PartCode.create('-ABC')).toThrow(
                InvalidPartCodeException,
            );
        });

        it('should throw InvalidPartCodeException for invalid characters', () => {
            expect(() => PartCode.create('ABC_123')).toThrow(
                InvalidPartCodeException,
            );
            expect(() => PartCode.create('ABC 123')).toThrow(
                InvalidPartCodeException,
            );
        });

        it('should return true for PartCode.isValid with valid input', () => {
            expect(PartCode.isValid('FIL-OLEO-10')).toBe(true);
        });

        it('should return false for PartCode.isValid with invalid input', () => {
            expect(PartCode.isValid('AB')).toBe(false);
            expect(PartCode.isValid('')).toBe(false);
        });
    });

    describe('Equality', () => {
        it('should be equal for the same code', () => {
            expect(
                PartCode.create('COR-01').equals(PartCode.create('cor-01')),
            ).toBe(true);
        });

        it('should not be equal for different codes or null', () => {
            expect(
                PartCode.create('COR-01').equals(PartCode.create('COR-02')),
            ).toBe(false);
            expect(PartCode.create('COR-01').equals(null)).toBe(false);
            expect(PartCode.create('COR-01').equals(undefined)).toBe(false);
        });

        it('should convert to string', () => {
            expect(PartCode.create('COR-01').toString()).toBe('COR-01');
        });
    });
});
