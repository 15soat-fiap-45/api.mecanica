// document.vo.ts

import type { Identifier } from '../../../shared/domain/entity-id.js';
import { InvalidDocumentException } from '../exceptions/InvalidDocumentException.js';

export type DocumentType = 'CPF' | 'CNPJ';

export class CpfCnpj implements Identifier {
    private readonly _value: string; // apenas dígitos
    private readonly _type: DocumentType;

    private constructor(value: string, type: DocumentType) {
        this._value = value;
        this._type = type;
        Object.freeze(this);
    }

    /** Cria o VO ou lança InvalidDocumentException */
    static create(input: string): CpfCnpj {
        const result = CpfCnpj.parse(input);
        if (!result.ok) throw new InvalidDocumentException(result.error);
        return result.value;
    }

    /** Versão sem exceção */
    static parse(
        input: string,
    ): { ok: true; value: CpfCnpj } | { ok: false; error: string } {
        if (typeof input !== 'string') {
            return { ok: false, error: 'Documento deve ser uma string' };
        }

        const digits = input.replace(/\D/g, '');

        if (digits.length === 11) {
            if (!CpfCnpj.isValidCpf(digits))
                return { ok: false, error: 'CPF inválido' };
            return { ok: true, value: new CpfCnpj(digits, 'CPF') };
        }

        if (digits.length === 14) {
            if (!CpfCnpj.isValidCnpj(digits))
                return { ok: false, error: 'CNPJ inválido' };
            return { ok: true, value: new CpfCnpj(digits, 'CNPJ') };
        }

        return {
            ok: false,
            error: 'Documento deve ter 11 (CPF) ou 14 (CNPJ) dígitos',
        };
    }

    static isValid(input: string): boolean {
        return CpfCnpj.parse(input).ok;
    }

    // ---------- Getters ----------

    get value(): string {
        return this._value;
    }

    get type(): DocumentType {
        return this._type;
    }

    get isCpf(): boolean {
        return this._type === 'CPF';
    }

    get isCnpj(): boolean {
        return this._type === 'CNPJ';
    }

    // ---------- Comportamento ----------

    /** 000.000.000-00 ou 00.000.000/0000-00 */
    format(): string {
        return this.isCpf
            ? this._value.replace(
                  /^(\d{3})(\d{3})(\d{3})(\d{2})$/,
                  '$1.$2.$3-$4',
              )
            : this._value.replace(
                  /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
                  '$1.$2.$3/$4-$5',
              );
    }

    /** Ex.: ***.456.789-** (útil para logs/telas) */
    mask(): string {
        return this.isCpf
            ? `***.${this._value.slice(3, 6)}.${this._value.slice(6, 9)}-**`
            : `**.${this._value.slice(2, 5)}.${this._value.slice(5, 8)}/****-**`;
    }

    equals(other?: Identifier | CpfCnpj | null): boolean {
        return !!other && other.toString() === this._value;
    }

    toString(): string {
        return this._value;
    }

    // ---------- Validações ----------

    private static allDigitsEqual(digits: string): boolean {
        return /^(\d)\1+$/.test(digits);
    }

    private static isValidCpf(cpf: string): boolean {
        if (CpfCnpj.allDigitsEqual(cpf)) return false;

        const calc = (len: number): number => {
            let sum = 0;
            for (let i = 0; i < len; i++) {
                sum += Number(cpf[i]) * (len + 1 - i);
            }
            const rest = (sum * 10) % 11;
            return rest === 10 ? 0 : rest;
        };

        return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
    }

    private static isValidCnpj(cnpj: string): boolean {
        if (CpfCnpj.allDigitsEqual(cnpj)) return false;

        const calc = (len: number): number => {
            const weights =
                len === 12
                    ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
                    : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

            let sum = 0;
            for (let i = 0; i < len; i++) {
                sum += Number(cnpj[i]) * weights[i]!;
            }
            const rest = sum % 11;
            return rest < 2 ? 0 : 11 - rest;
        };

        return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
    }
}
