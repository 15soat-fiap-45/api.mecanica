import { describe, expect, it } from 'vitest';
import { CodigoPeca, CodigoPecaInvalidoException } from './codigo-peca.js';

describe('CodigoPeca Value Object', () => {
    describe('Criação e normalização', () => {
        it('should create a valid part code', () => {
            const codigo = CodigoPeca.create('PAST-FREIO-01');
            expect(codigo.value).toBe('PAST-FREIO-01');
        });

        it('should normalize lowercase and surrounding spaces to uppercase', () => {
            const codigo = CodigoPeca.create('  abc-123  ');
            expect(codigo.value).toBe('ABC-123');
        });

        it('should accept the minimum length of 3 characters', () => {
            expect(CodigoPeca.create('A1B').value).toBe('A1B');
        });
    });

    describe('Validação e erros', () => {
        it('should throw CodigoPecaInvalidoException for too short codes', () => {
            expect(() => CodigoPeca.create('AB')).toThrow(
                CodigoPecaInvalidoException,
            );
            expect(() => CodigoPeca.create('')).toThrow(
                CodigoPecaInvalidoException,
            );
        });

        it('should throw CodigoPecaInvalidoException for codes starting with a hyphen', () => {
            expect(() => CodigoPeca.create('-ABC')).toThrow(
                CodigoPecaInvalidoException,
            );
        });

        it('should throw CodigoPecaInvalidoException for invalid characters', () => {
            expect(() => CodigoPeca.create('ABC_123')).toThrow(
                CodigoPecaInvalidoException,
            );
            expect(() => CodigoPeca.create('ABC 123')).toThrow(
                CodigoPecaInvalidoException,
            );
        });

        it('should return true for CodigoPeca.isValid with valid input', () => {
            expect(CodigoPeca.isValid('FIL-OLEO-10')).toBe(true);
        });

        it('should return false for CodigoPeca.isValid with invalid input', () => {
            expect(CodigoPeca.isValid('AB')).toBe(false);
            expect(CodigoPeca.isValid('')).toBe(false);
        });
    });

    describe('Igualdade', () => {
        it('should be equal for the same code', () => {
            expect(
                CodigoPeca.create('COR-01').equals(CodigoPeca.create('cor-01')),
            ).toBe(true);
        });

        it('should not be equal for different codes or null', () => {
            expect(
                CodigoPeca.create('COR-01').equals(CodigoPeca.create('COR-02')),
            ).toBe(false);
            expect(CodigoPeca.create('COR-01').equals(null)).toBe(false);
            expect(CodigoPeca.create('COR-01').equals(undefined)).toBe(false);
        });

        it('should convert to string', () => {
            expect(CodigoPeca.create('COR-01').toString()).toBe('COR-01');
        });
    });
});
