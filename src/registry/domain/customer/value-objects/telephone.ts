// telephone.vo.ts

import { InvalidTelephoneError } from '../exceptions/InvalidTelephoneException.js';

export class Telephone {
    // DDD (11-99) + celular (9 + 8 dígitos) ou fixo (2-5 + 7 dígitos)
    private static readonly REGEX = /^[1-9]\d(?:9\d{8}|[2-5]\d{7})$/;

    private readonly _value: string; // apenas dígitos, sem DDI

    private constructor(value: string) {
        this._value = value;
        Object.freeze(this);
    }

    /** Cria o VO ou lança InvalidTelephoneError */
    static create(input: string): Telephone {
        const result = Telephone.parse(input);
        if (!result.ok) throw new InvalidTelephoneError(result.error);
        return result.value;
    }

    /** Versão sem exceção */
    static parse(
        input: string,
    ): { ok: true; value: Telephone } | { ok: false; error: string } {
        if (typeof input !== 'string') {
            return { ok: false, error: 'Telefone deve ser uma string' };
        }

        const digits = input.replace(/\D/g, '');

        if (!Telephone.REGEX.test(digits)) {
            return { ok: false, error: 'Telefone inválido' };
        }

        return { ok: true, value: new Telephone(digits) };
    }

    static isValid(input: string): boolean {
        return Telephone.parse(input).ok;
    }

    get value(): string {
        return this._value;
    }

    get isMobile(): boolean {
        return this._value.length === 11;
    }

    /** (00) 00000-0000 ou (00) 0000-0000 */
    format(): string {
        return this.isMobile
            ? this._value.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3')
            : this._value.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
    }

    equals(other?: Telephone | null): boolean {
        return !!other && other._value === this._value;
    }

    toString(): string {
        return this._value;
    }
}
