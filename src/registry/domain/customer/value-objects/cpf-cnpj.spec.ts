// document.vo.test.ts
import { describe, expect, it } from 'vitest';
import { InvalidDocumentException } from '../exceptions/InvalidDocumentException.js';
import { CpfCnpj } from './cpf-cnpj.js';

const VALID_CPF = '52998224725';
const VALID_CPF_2 = '11144477735';
const VALID_CNPJ = '11222333000181';
const VALID_CNPJ_2 = '11444777000161';

describe('CpfCnpj', () => {
    describe('create', () => {
        it('cria um CPF válido (somente dígitos)', () => {
            const doc = CpfCnpj.create(VALID_CPF);

            expect(doc.value).toBe(VALID_CPF);
            expect(doc.type).toBe('CPF');
            expect(doc.isCpf).toBe(true);
            expect(doc.isCnpj).toBe(false);
        });

        it('cria um CPF válido a partir de entrada formatada', () => {
            const doc = CpfCnpj.create('529.982.247-25');

            expect(doc.value).toBe(VALID_CPF);
        });

        it('cria um CNPJ válido (somente dígitos)', () => {
            const doc = CpfCnpj.create(VALID_CNPJ);

            expect(doc.value).toBe(VALID_CNPJ);
            expect(doc.type).toBe('CNPJ');
            expect(doc.isCnpj).toBe(true);
            expect(doc.isCpf).toBe(false);
        });

        it('cria um CNPJ válido a partir de entrada formatada', () => {
            const doc = CpfCnpj.create('11.222.333/0001-81');

            expect(doc.value).toBe(VALID_CNPJ);
        });

        it('lança InvalidDocumentException para documento inválido', () => {
            expect(() => CpfCnpj.create('123')).toThrow(
                InvalidDocumentException,
            );
        });

        it('propaga a mensagem de erro do parse', () => {
            expect(() => CpfCnpj.create('52998224726')).toThrow('CPF inválido');
            expect(() => CpfCnpj.create('11222333000182')).toThrow(
                'CNPJ inválido',
            );
        });

        it('retorna uma instância congelada (imutável)', () => {
            const doc = CpfCnpj.create(VALID_CPF);

            expect(Object.isFrozen(doc)).toBe(true);
        });
    });

    describe('parse', () => {
        it('retorna ok: true com o VO para CPF válido', () => {
            const result = CpfCnpj.parse(VALID_CPF);

            expect(result.ok).toBe(true);
            if (result.ok) expect(result.value.value).toBe(VALID_CPF);
        });

        it('retorna ok: true com o VO para CNPJ válido', () => {
            const result = CpfCnpj.parse(VALID_CNPJ);

            expect(result.ok).toBe(true);
            if (result.ok) expect(result.value.type).toBe('CNPJ');
        });

        it('rejeita entrada que não é string', () => {
            const result = CpfCnpj.parse(12345678909 as unknown as string);

            expect(result).toEqual({
                ok: false,
                error: 'Documento deve ser uma string',
            });
        });

        it.each([
            '',
            'abc',
            '123',
            '1234567890',
            '123456789012',
            '1234567890123',
        ])('rejeita tamanho inválido: "%s"', (input) => {
            const result = CpfCnpj.parse(input);

            expect(result).toEqual({
                ok: false,
                error: 'Documento deve ter 11 (CPF) ou 14 (CNPJ) dígitos',
            });
        });

        it('rejeita CPF com dígito verificador errado', () => {
            expect(CpfCnpj.parse('52998224726')).toEqual({
                ok: false,
                error: 'CPF inválido',
            });
            expect(CpfCnpj.parse('52998224715')).toEqual({
                ok: false,
                error: 'CPF inválido',
            });
        });

        it('rejeita CNPJ com dígito verificador errado', () => {
            expect(CpfCnpj.parse('11222333000182')).toEqual({
                ok: false,
                error: 'CNPJ inválido',
            });
            expect(CpfCnpj.parse('11222333000171')).toEqual({
                ok: false,
                error: 'CNPJ inválido',
            });
        });

        it.each(['00000000000', '11111111111', '99999999999'])(
            'rejeita CPF com todos os dígitos iguais: %s',
            (cpf) => {
                expect(CpfCnpj.parse(cpf)).toEqual({
                    ok: false,
                    error: 'CPF inválido',
                });
            },
        );

        it.each(['00000000000000', '11111111111111', '99999999999999'])(
            'rejeita CNPJ com todos os dígitos iguais: %s',
            (cnpj) => {
                expect(CpfCnpj.parse(cnpj)).toEqual({
                    ok: false,
                    error: 'CNPJ inválido',
                });
            },
        );
    });

    describe('isValid', () => {
        it('retorna true para documentos válidos', () => {
            expect(CpfCnpj.isValid(VALID_CPF)).toBe(true);
            expect(CpfCnpj.isValid(VALID_CPF_2)).toBe(true);
            expect(CpfCnpj.isValid(VALID_CNPJ)).toBe(true);
            expect(CpfCnpj.isValid(VALID_CNPJ_2)).toBe(true);
            expect(CpfCnpj.isValid('529.982.247-25')).toBe(true);
            expect(CpfCnpj.isValid('11.222.333/0001-81')).toBe(true);
        });

        it('retorna false para documentos inválidos', () => {
            expect(CpfCnpj.isValid('')).toBe(false);
            expect(CpfCnpj.isValid('111.111.111-11')).toBe(false);
            expect(CpfCnpj.isValid('123.456.789-00')).toBe(false);
            expect(CpfCnpj.isValid('00.000.000/0000-00')).toBe(false);
        });
    });

    describe('format', () => {
        it('formata CPF como 000.000.000-00', () => {
            expect(CpfCnpj.create(VALID_CPF).format()).toBe('529.982.247-25');
        });

        it('formata CNPJ como 00.000.000/0000-00', () => {
            expect(CpfCnpj.create(VALID_CNPJ).format()).toBe(
                '11.222.333/0001-81',
            );
        });
    });

    describe('mask', () => {
        it('mascara CPF', () => {
            expect(CpfCnpj.create(VALID_CPF).mask()).toBe('***.982.247-**');
        });

        it('mascara CNPJ', () => {
            expect(CpfCnpj.create(VALID_CNPJ).mask()).toBe(
                '**.222.333/****-**',
            );
        });
    });

    describe('equals', () => {
        it('é true para o mesmo documento, independente da formatação', () => {
            const a = CpfCnpj.create('529.982.247-25');
            const b = CpfCnpj.create(VALID_CPF);

            expect(a.equals(b)).toBe(true);
        });

        it('é false para documentos diferentes', () => {
            const a = CpfCnpj.create(VALID_CPF);
            const b = CpfCnpj.create(VALID_CPF_2);

            expect(a.equals(b)).toBe(false);
        });

        it('é false para null e undefined', () => {
            const a = CpfCnpj.create(VALID_CPF);

            expect(a.equals(null)).toBe(false);
            expect(a.equals(undefined)).toBe(false);
        });
    });

    describe('toString', () => {
        it('retorna somente os dígitos', () => {
            expect(CpfCnpj.create('529.982.247-25').toString()).toBe(VALID_CPF);
            expect(`${CpfCnpj.create(VALID_CNPJ)}`).toBe(VALID_CNPJ);
        });
    });
});
