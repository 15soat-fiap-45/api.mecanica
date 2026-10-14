import { DomainException } from '../../../../shared/domain/domain-exception.js';

export class InvalidUnitOfMeasureException extends DomainException {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidUnitOfMeasureException';
    }
}

export type UnitOfMeasureType =
    'UNIT' | 'PAIR' | 'SET' | 'LITER' | 'KILOGRAM' | 'METER';

export class UnitOfMeasure {
    private static readonly VALUES: readonly UnitOfMeasureType[] = [
        'UNIT',
        'PAIR',
        'SET',
        'LITER',
        'KILOGRAM',
        'METER',
    ];

    private readonly _value: UnitOfMeasureType;

    private constructor(value: UnitOfMeasureType) {
        this._value = value;
        Object.freeze(this);
    }

    /** Creates UnitOfMeasure VO or throws InvalidUnitOfMeasureException */
    static create(input: string): UnitOfMeasure {
        const result = UnitOfMeasure.parse(input);
        if (!result.ok) throw new InvalidUnitOfMeasureException(result.error);
        return result.value;
    }

    /** Non-throwing parse method */
    static parse(
        input: string,
    ): { ok: true; value: UnitOfMeasure } | { ok: false; error: string } {
        if (typeof input !== 'string') {
            return { ok: false, error: 'Unit of measure must be a string' };
        }

        const normalized = input.trim().toUpperCase() as UnitOfMeasureType;

        if (!UnitOfMeasure.VALUES.includes(normalized)) {
            return {
                ok: false,
                error: `Invalid unit of measure. Accepted values: ${UnitOfMeasure.VALUES.join(', ')}`,
            };
        }

        return { ok: true, value: new UnitOfMeasure(normalized) };
    }

    static isValid(input: string): boolean {
        return UnitOfMeasure.parse(input).ok;
    }

    get value(): UnitOfMeasureType {
        return this._value;
    }

    equals(other?: UnitOfMeasure | null): boolean {
        return !!other && other._value === this._value;
    }

    toString(): string {
        return this._value;
    }
}
