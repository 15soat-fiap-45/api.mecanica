import { describe, expect, it } from 'vitest';
import {
    Quantidade,
    QuantidadeInsuficienteException,
    QuantidadeInvalidaException,
} from './quantidade.js';

describe('Quantidade Value Object', () => {
    describe('Criação e validação', () => {
        it('should create a valid quantity', () => {
            const quantidade = Quantidade.create(10);
            expect(quantidade.value).toBe(10);
        });

        it('should accept zero', () => {
            const quantidade = Quantidade.create(0);
            expect(quantidade.value).toBe(0);
        });

        it('should create zero quantity via Quantidade.zero()', () => {
            expect(Quantidade.zero().value).toBe(0);
        });

        it('should throw QuantidadeInvalidaException for negative values', () => {
            expect(() => Quantidade.create(-1)).toThrow(
                QuantidadeInvalidaException,
            );
        });

        it('should throw QuantidadeInvalidaException for non-integer values', () => {
            expect(() => Quantidade.create(1.5)).toThrow(
                QuantidadeInvalidaException,
            );
        });

        it('should throw QuantidadeInvalidaException for NaN', () => {
            expect(() => Quantidade.create(Number.NaN)).toThrow(
                QuantidadeInvalidaException,
            );
        });

        it('should return true for Quantidade.isValid with valid input', () => {
            expect(Quantidade.isValid(0)).toBe(true);
            expect(Quantidade.isValid(42)).toBe(true);
        });

        it('should return false for Quantidade.isValid with invalid input', () => {
            expect(Quantidade.isValid(-5)).toBe(false);
            expect(Quantidade.isValid(2.7)).toBe(false);
            expect(Quantidade.isValid(Number.NaN)).toBe(false);
        });
    });

    describe('Operações', () => {
        it('should sum two quantities', () => {
            const resultado = Quantidade.create(5).somar(Quantidade.create(3));
            expect(resultado.value).toBe(8);
        });

        it('should subtract two quantities', () => {
            const resultado = Quantidade.create(5).subtrair(
                Quantidade.create(3),
            );
            expect(resultado.value).toBe(2);
        });

        it('should allow subtraction resulting in zero', () => {
            const resultado = Quantidade.create(4).subtrair(
                Quantidade.create(4),
            );
            expect(resultado.value).toBe(0);
        });

        it('should throw QuantidadeInsuficienteException when subtraction exceeds available', () => {
            expect(() =>
                Quantidade.create(2).subtrair(Quantidade.create(3)),
            ).toThrow(QuantidadeInsuficienteException);
        });

        it('should not mutate the original quantities', () => {
            const original = Quantidade.create(5);
            original.somar(Quantidade.create(3));
            original.subtrair(Quantidade.create(2));
            expect(original.value).toBe(5);
        });
    });

    describe('Igualdade', () => {
        it('should be equal for the same value', () => {
            expect(Quantidade.create(7).equals(Quantidade.create(7))).toBe(
                true,
            );
        });

        it('should not be equal for different values or null', () => {
            expect(Quantidade.create(7).equals(Quantidade.create(8))).toBe(
                false,
            );
            expect(Quantidade.create(7).equals(null)).toBe(false);
        });

        it('should convert to string', () => {
            expect(Quantidade.create(10).toString()).toBe('10');
        });
    });
});
