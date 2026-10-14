import { DomainException } from '../../../../shared/domain/domain-exception.js';
import type { Identifier } from '../../../../shared/domain/entity-id.js';

export class InvalidPartCodeException extends DomainException {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidPartCodeException';
    }
}

export class PartCode implements Identifier {
    private static readonly CODE_REGEX = /^[A-Z0-9][A-Z0-9-]{2,49}$/;

    private readonly _value: string;

    private constructor(value: string) {
        this._value = value;
        Object.freeze(this);
    }

    /** Creates PartCode VO or throws InvalidPartCodeException */
    static create(input: string): PartCode {
        const result = PartCode.parse(input);
        if (!result.ok) throw new InvalidPartCodeException(result.error);
        return result.value;
    }

    /** Non-throwing parse method */
    static parse(
        input: string,
    ): { ok: true; value: PartCode } | { ok: false; error: string } {
        if (typeof input !== 'string') {
            return { ok: false, error: 'Part code must be a string' };
        }

        const normalized = input.trim().toUpperCase();

        if (!PartCode.CODE_REGEX.test(normalized)) {
            return {
                ok: false,
                error: 'Part code must be 3 to 50 alphanumeric characters long',
            };
        }

        return { ok: true, value: new PartCode(normalized) };
    }

    static isValid(input: string): boolean {
        return PartCode.parse(input).ok;
    }

    get value(): string {
        return this._value;
    }

    equals(other?: Identifier | PartCode | null): boolean {
        return (
            !!other &&
            (other instanceof PartCode
                ? other._value === this._value
                : other.toString().trim().toUpperCase() === this._value)
        );
    }

    toString(): string {
        return this._value;
    }
}
