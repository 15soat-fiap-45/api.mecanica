import { describe, expect, it } from 'vitest';
import {
    UnidadeMedida,
    UnidadeMedidaInvalidaException,
} from './unidade-medida.js';

describe('UnidadeMedida Value Object', () => {
    describe('Criação', () => {
        it.each(['UNIDADE', 'PAR', 'JOGO', 'LITRO', 'QUILOGRAMA', 'METRO'])(
            'should create unit of measure %s',
            (tipo) => {
                const unidade = UnidadeMedida.create(tipo);
                expect(unidade.value).toBe(tipo);
            },
        );

        it('should normalize lowercase input', () => {
            const unidade = UnidadeMedida.create('litro');
            expect(unidade.value).toBe('LITRO');
        });
    });

    describe('Validação e erros', () => {
        it('should throw UnidadeMedidaInvalidaException for unknown values', () => {
            expect(() => UnidadeMedida.create('CAIXA')).toThrow(
                UnidadeMedidaInvalidaException,
            );
            expect(() => UnidadeMedida.create('')).toThrow(
                UnidadeMedidaInvalidaException,
            );
        });

        it('should return true for UnidadeMedida.isValid with valid input', () => {
            expect(UnidadeMedida.isValid('UNIDADE')).toBe(true);
            expect(UnidadeMedida.isValid('metro')).toBe(true);
        });

        it('should return false for UnidadeMedida.isValid with invalid input', () => {
            expect(UnidadeMedida.isValid('GRAMA')).toBe(false);
            expect(UnidadeMedida.isValid('')).toBe(false);
        });
    });

    describe('Igualdade', () => {
        it('should be equal for the same unit', () => {
            expect(
                UnidadeMedida.create('PAR').equals(UnidadeMedida.create('PAR')),
            ).toBe(true);
        });

        it('should not be equal for different units or null', () => {
            expect(
                UnidadeMedida.create('PAR').equals(
                    UnidadeMedida.create('JOGO'),
                ),
            ).toBe(false);
            expect(UnidadeMedida.create('PAR').equals(null)).toBe(false);
        });

        it('should convert to string', () => {
            expect(UnidadeMedida.create('QUILOGRAMA').toString()).toBe(
                'QUILOGRAMA',
            );
        });
    });
});
