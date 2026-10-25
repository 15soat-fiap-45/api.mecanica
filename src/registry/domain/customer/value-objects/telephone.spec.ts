import { describe, expect, it } from 'vitest';
import { InvalidTelephoneError } from '../exceptions/InvalidTelephoneException.js';
import { Telephone } from './telephone.js';

const VALID_MOBILE = '11987654321';
const VALID_MOBILE_FORMATTED = '(11) 98765-4321';
const VALID_LANDLINE = '1134567890';
const VALID_LANDLINE_FORMATTED = '(11) 3456-7890';
const VALID_LANDLINE_2 = '2123456789';

describe('Telephone', () => {
    describe('create', () => {
        it('cria um celular válido (somente dígitos)', () => {
            const phone = Telephone.create(VALID_MOBILE);

            expect(phone.value).toBe(VALID_MOBILE);
            expect(phone.isMobile).toBe(true);
        });

        it('cria um celular válido a partir de entrada formatada', () => {
            const phone = Telephone.create(VALID_MOBILE_FORMATTED);

            expect(phone.value).toBe(VALID_MOBILE);
            expect(phone.isMobile).toBe(true);
        });

        it('cria um telefone fixo válido (somente dígitos)', () => {
            const phone = Telephone.create(VALID_LANDLINE);

            expect(phone.value).toBe(VALID_LANDLINE);
            expect(phone.isMobile).toBe(false);
        });

        it('cria um telefone fixo válido a partir de entrada formatada', () => {
            const phone = Telephone.create(VALID_LANDLINE_FORMATTED);

            expect(phone.value).toBe(VALID_LANDLINE);
            expect(phone.isMobile).toBe(false);
        });

        it('lança InvalidTelephoneError para telefone inválido', () => {
            expect(() => Telephone.create('123')).toThrow(
                InvalidTelephoneError,
            );
        });

        it('propaga a mensagem de erro do parse', () => {
            expect(() => Telephone.create('123')).toThrow('Telefone inválido');
            expect(() => Telephone.create(123 as unknown as string)).toThrow(
                'Telefone deve ser uma string',
            );
        });

        it('retorna uma instância congelada (imutável)', () => {
            const phone = Telephone.create(VALID_MOBILE);

            expect(Object.isFrozen(phone)).toBe(true);
        });
    });

    describe('parse', () => {
        it('retorna ok: true com o VO para celular válido', () => {
            const result = Telephone.parse(VALID_MOBILE);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.value).toBe(VALID_MOBILE);
                expect(result.value.isMobile).toBe(true);
            }
        });

        it('retorna ok: true com o VO para telefone fixo válido', () => {
            const result = Telephone.parse(VALID_LANDLINE);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value.value).toBe(VALID_LANDLINE);
                expect(result.value.isMobile).toBe(false);
            }
        });

        it('rejeita entrada que não é string', () => {
            const result = Telephone.parse(11987654321 as unknown as string);

            expect(result).toEqual({
                ok: false,
                error: 'Telefone deve ser uma string',
            });
        });

        it.each([
            '',
            'abc',
            '123',
            '119876543', // 9 dígitos com DDD
            '119876543210', // 12 dígitos com DDD
            '01987654321', // DDD inválido (começa com 0)
            '0134567890', // DDD inválido no fixo
            '11887654321', // celular de 11 dígitos que não inicia com 9
            '11787654321', // celular de 11 dígitos que não inicia com 9
            '1114567890', // fixo de 10 dígitos iniciando com 1
            '1164567890', // fixo de 10 dígitos iniciando com 6
            '1174567890', // fixo de 10 dígitos iniciando com 7
            '1184567890', // fixo de 10 dígitos iniciando com 8
            '1194567890', // fixo de 10 dígitos iniciando com 9
            '1104567890', // fixo de 10 dígitos iniciando com 0
        ])('rejeita telefone inválido: "%s"', (input) => {
            const result = Telephone.parse(input);

            expect(result).toEqual({
                ok: false,
                error: 'Telefone inválido',
            });
        });
    });

    describe('isValid', () => {
        it('retorna true para telefones válidos', () => {
            expect(Telephone.isValid(VALID_MOBILE)).toBe(true);
            expect(Telephone.isValid(VALID_MOBILE_FORMATTED)).toBe(true);
            expect(Telephone.isValid(VALID_LANDLINE)).toBe(true);
            expect(Telephone.isValid(VALID_LANDLINE_FORMATTED)).toBe(true);
            expect(Telephone.isValid(VALID_LANDLINE_2)).toBe(true);
            expect(Telephone.isValid('(11) 2345-6789')).toBe(true);
            expect(Telephone.isValid('(11) 4567-8901')).toBe(true);
            expect(Telephone.isValid('(11) 5678-9012')).toBe(true);
        });

        it('retorna false para telefones inválidos', () => {
            expect(Telephone.isValid('')).toBe(false);
            expect(Telephone.isValid('123')).toBe(false);
            expect(Telephone.isValid('11887654321')).toBe(false);
            expect(Telephone.isValid(null as unknown as string)).toBe(false);
            expect(Telephone.isValid(undefined as unknown as string)).toBe(
                false,
            );
        });
    });

    describe('isMobile', () => {
        it('retorna true para celular (11 dígitos)', () => {
            expect(Telephone.create(VALID_MOBILE).isMobile).toBe(true);
        });

        it('retorna false para telefone fixo (10 dígitos)', () => {
            expect(Telephone.create(VALID_LANDLINE).isMobile).toBe(false);
        });
    });

    describe('format', () => {
        it('formata celular como (00) 00000-0000', () => {
            expect(Telephone.create(VALID_MOBILE).format()).toBe(
                '(11) 98765-4321',
            );
        });

        it('formata telefone fixo como (00) 0000-0000', () => {
            expect(Telephone.create(VALID_LANDLINE).format()).toBe(
                '(11) 3456-7890',
            );
        });
    });

    describe('equals', () => {
        it('é true para o mesmo telefone, independente da formatação', () => {
            const a = Telephone.create(VALID_MOBILE_FORMATTED);
            const b = Telephone.create(VALID_MOBILE);

            expect(a.equals(b)).toBe(true);
        });

        it('é false para telefones diferentes', () => {
            const a = Telephone.create(VALID_MOBILE);
            const b = Telephone.create(VALID_LANDLINE);

            expect(a.equals(b)).toBe(false);
        });

        it('é false para null e undefined', () => {
            const a = Telephone.create(VALID_MOBILE);

            expect(a.equals(null)).toBe(false);
            expect(a.equals(undefined)).toBe(false);
        });
    });

    describe('toString', () => {
        it('retorna somente os dígitos', () => {
            expect(Telephone.create(VALID_MOBILE_FORMATTED).toString()).toBe(
                VALID_MOBILE,
            );
            expect(`${Telephone.create(VALID_LANDLINE_FORMATTED)}`).toBe(
                VALID_LANDLINE,
            );
        });
    });
});
