import { DomainException } from '../../../shared/domain/domain-exception.js';
import type { Identifier } from '../../../shared/domain/entity-id.js';

export class InvalidPlateException extends DomainException {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidPlateException';
    }
}

export type PlateType = 'TRADITIONAL' | 'MERCOSUL';

export class Plate implements Identifier {
    private static readonly TRADITIONAL_REGEX = /^[A-Z]{3}[0-9]{4}$/;
    private static readonly MERCOSUL_REGEX = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;

    private readonly _value: string;
    private readonly _type: PlateType;

    private constructor(value: string, type: PlateType) {
        this._value = value;
        this._type = type;
        Object.freeze(this);
    }

    /** Creates Plate VO or throws InvalidPlateException */
    static create(input: string): Plate {
        const result = Plate.parse(input);
        if (!result.ok) throw new InvalidPlateException(result.error);
        return result.value;
    }

    /** Non-throwing parse method */
    static parse(
        input: string,
    ): { ok: true; value: Plate } | { ok: false; error: string } {
        if (typeof input !== 'string') {
            return { ok: false, error: 'Plate must be a string' };
        }

        const normalized = input.trim().toUpperCase().replace(/[- ]/g, '');

        if (Plate.TRADITIONAL_REGEX.test(normalized)) {
            return { ok: true, value: new Plate(normalized, 'TRADITIONAL') };
        }

        if (Plate.MERCOSUL_REGEX.test(normalized)) {
            return { ok: true, value: new Plate(normalized, 'MERCOSUL') };
        }

        return { ok: false, error: 'Invalid license plate format' };
    }

    static isValid(input: string): boolean {
        return Plate.parse(input).ok;
    }

    get value(): string {
        return this._value;
    }

    get type(): PlateType {
        return this._type;
    }

    get isMercosul(): boolean {
        return this._type === 'MERCOSUL';
    }

    /** Formats traditional plate as ABC-1234 or Mercosul as ABC1D23 */
    format(): string {
        if (this._type === 'TRADITIONAL') {
            return `${this._value.slice(0, 3)}-${this._value.slice(3)}`;
        }
        return this._value;
    }

    equals(other?: Identifier | Plate | null): boolean {
        return (
            !!other &&
            (other instanceof Plate
                ? other._value === this._value
                : other.toString().replace(/[- ]/g, '').toUpperCase() ===
                  this._value)
        );
    }

    toString(): string {
        return this.format();
    }
}
