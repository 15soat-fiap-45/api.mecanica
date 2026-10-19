import { describe, expect, it } from 'vitest';
import { InvalidEmailException } from '../exceptions/InvalidEmailException.js';
import { Email } from './email.js';

const VALID_EMAIL = 'user@example.com';
const VALID_EMAIL_2 = 'another.user@domain.com.br';

describe('Email', () => {
    describe('create', () => {
        it('cria um email válido', () => {
            const email = Email.create(VALID_EMAIL);

            expect(email.value).toBe(VALID_EMAIL);
        });

        it('normaliza para minúsculas e remove espaços ao redor', () => {
            const email = Email.create('  USER@EXAMPLE.COM  ');

            expect(email.value).toBe('user@example.com');
        });

        it('lança InvalidEmailException para email inválido', () => {
            expect(() => Email.create('invalid-email')).toThrow(
                InvalidEmailException,
            );
        });

        it('propaga a mensagem de erro do parse', () => {
            expect(() => Email.create('invalid-email')).toThrow(
                'Email inválido',
            );
            expect(() => Email.create(123 as unknown as string)).toThrow(
                'Email deve ser uma string',
            );
        });

        it('retorna uma instância congelada (imutável)', () => {
            const email = Email.create(VALID_EMAIL);

            expect(Object.isFrozen(email)).toBe(true);
        });
    });

    describe('parse', () => {
        it('retorna ok: true com o VO para email válido', () => {
            const result = Email.parse(VALID_EMAIL);

            expect(result.ok).toBe(true);
            if (result.ok) expect(result.value.value).toBe(VALID_EMAIL);
        });

        it('rejeita entrada que não é string', () => {
            const result = Email.parse(123 as unknown as string);

            expect(result).toEqual({
                ok: false,
                error: 'Email deve ser uma string',
            });
        });

        it.each([
            '',
            '   ',
            'plainaddress',
            '@example.com',
            'email.example.com',
            'email@',
            'email@example',
            'user @example.com',
            'user@ example.com',
            'user@example .com',
            'user@.com',
        ])('rejeita formato de email inválido: "%s"', (input) => {
            const result = Email.parse(input);

            expect(result).toEqual({
                ok: false,
                error: 'Email inválido',
            });
        });
    });

    describe('isValid', () => {
        it('retorna true para emails válidos', () => {
            expect(Email.isValid(VALID_EMAIL)).toBe(true);
            expect(Email.isValid(VALID_EMAIL_2)).toBe(true);
            expect(Email.isValid('user.name+tag@sub.example.com')).toBe(true);
            expect(Email.isValid('  user@example.com  ')).toBe(true);
            expect(Email.isValid('USER@EXAMPLE.COM')).toBe(true);
        });

        it('retorna false para emails inválidos', () => {
            expect(Email.isValid('')).toBe(false);
            expect(Email.isValid('invalid-email')).toBe(false);
            expect(Email.isValid('@domain.com')).toBe(false);
            expect(Email.isValid('user@domain')).toBe(false);
            expect(Email.isValid(null as unknown as string)).toBe(false);
            expect(Email.isValid(undefined as unknown as string)).toBe(false);
            expect(Email.isValid(123 as unknown as string)).toBe(false);
        });
    });

    describe('value', () => {
        it('retorna o valor normalizado do email', () => {
            const email = Email.create('  Hello@World.Com  ');

            expect(email.value).toBe('hello@world.com');
        });
    });

    describe('equals', () => {
        it('é true para o mesmo email, independente de maiúsculas/minúsculas e espaços originais', () => {
            const a = Email.create('  user@example.com  ');
            const b = Email.create('USER@EXAMPLE.COM');

            expect(a.equals(b)).toBe(true);
        });

        it('é false para emails diferentes', () => {
            const a = Email.create(VALID_EMAIL);
            const b = Email.create(VALID_EMAIL_2);

            expect(a.equals(b)).toBe(false);
        });

        it('é false para null e undefined', () => {
            const a = Email.create(VALID_EMAIL);

            expect(a.equals(null)).toBe(false);
            expect(a.equals(undefined)).toBe(false);
        });
    });

    describe('toString', () => {
        it('retorna o valor em string', () => {
            const email = Email.create(VALID_EMAIL);

            expect(email.toString()).toBe(VALID_EMAIL);
            expect(`${email}`).toBe(VALID_EMAIL);
        });
    });
});
