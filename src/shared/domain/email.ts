import { InvalidEmailException } from './invalid-email-exception.js';

export class Email {
    private static readonly REGEX = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

    private readonly _value: string;

    private constructor(value: string) {
        this._value = value;
        Object.freeze(this);
    }

    static create(input: string): Email {
        const result = Email.parse(input);
        if (!result.ok) throw new InvalidEmailException(result.error);
        return result.value;
    }

    static parse(
        input: string,
    ): { ok: true; value: Email } | { ok: false; error: string } {
        if (typeof input !== 'string') {
            return { ok: false, error: 'Email deve ser uma string' };
        }

        const normalized = input.trim().toLowerCase();

        if (!Email.REGEX.test(normalized)) {
            return { ok: false, error: 'Email inválido' };
        }

        return { ok: true, value: new Email(normalized) };
    }

    static isValid(input: string): boolean {
        return Email.parse(input).ok;
    }

    get value(): string {
        return this._value;
    }

    equals(other?: Email | null): boolean {
        return !!other && other._value === this._value;
    }

    toString(): string {
        return this._value;
    }
}
