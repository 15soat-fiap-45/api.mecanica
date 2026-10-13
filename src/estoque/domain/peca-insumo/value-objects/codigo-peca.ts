import { DomainException } from '../../../../shared/domain/domain-exception.js';
import type { Identifier } from '../../../../shared/domain/entity-id.js';

export class CodigoPecaInvalidoException extends DomainException {
    constructor(message: string) {
        super(message);
        this.name = 'CodigoPecaInvalidoException';
    }
}

export class CodigoPeca implements Identifier {
    private static readonly CODIGO_REGEX = /^[A-Z0-9][A-Z0-9-]{2,49}$/;

    private readonly _value: string;

    private constructor(value: string) {
        this._value = value;
        Object.freeze(this);
    }

    /** Creates CodigoPeca VO or throws CodigoPecaInvalidoException */
    static create(input: string): CodigoPeca {
        const result = CodigoPeca.parse(input);
        if (!result.ok) throw new CodigoPecaInvalidoException(result.error);
        return result.value;
    }

    /** Non-throwing parse method */
    static parse(
        input: string,
    ): { ok: true; value: CodigoPeca } | { ok: false; error: string } {
        if (typeof input !== 'string') {
            return { ok: false, error: 'Código da peça deve ser um texto' };
        }

        const normalized = input.trim().toUpperCase();

        if (!CodigoPeca.CODIGO_REGEX.test(normalized)) {
            return {
                ok: false,
                error: 'Código da peça deve ter entre 3 e 50 caracteres alfanuméricos',
            };
        }

        return { ok: true, value: new CodigoPeca(normalized) };
    }

    static isValid(input: string): boolean {
        return CodigoPeca.parse(input).ok;
    }

    get value(): string {
        return this._value;
    }

    equals(other?: Identifier | CodigoPeca | null): boolean {
        return (
            !!other &&
            (other instanceof CodigoPeca
                ? other._value === this._value
                : other.toString().trim().toUpperCase() === this._value)
        );
    }

    toString(): string {
        return this._value;
    }
}
