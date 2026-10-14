import { DomainException } from '../../../../shared/domain/domain-exception.js';

export class InvalidQuantityException extends DomainException {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidQuantityException';
    }
}

export class InsufficientQuantityException extends DomainException {
    constructor(message = 'Insufficient stock quantity') {
        super(message);
        this.name = 'InsufficientQuantityException';
    }
}

export class Quantity {
    private readonly _value: number;

    private constructor(value: number) {
        this._value = value;
        Object.freeze(this);
    }

    /** Creates Quantity VO or throws InvalidQuantityException */
    static create(input: number): Quantity {
        const result = Quantity.parse(input);
        if (!result.ok) throw new InvalidQuantityException(result.error);
        return result.value;
    }

    static zero(): Quantity {
        return new Quantity(0);
    }

    /** Non-throwing parse method */
    static parse(
        input: number,
    ): { ok: true; value: Quantity } | { ok: false; error: string } {
        if (typeof input !== 'number' || Number.isNaN(input)) {
            return { ok: false, error: 'Quantity must be a number' };
        }

        if (!Number.isInteger(input)) {
            return { ok: false, error: 'Quantity must be an integer' };
        }

        if (input < 0) {
            return { ok: false, error: 'Quantity cannot be negative' };
        }

        return { ok: true, value: new Quantity(input) };
    }

    static isValid(input: number): boolean {
        return Quantity.parse(input).ok;
    }

    get value(): number {
        return this._value;
    }

    add(other: Quantity): Quantity {
        return new Quantity(this._value + other._value);
    }

    subtract(other: Quantity): Quantity {
        if (other._value > this._value) {
            throw new InsufficientQuantityException();
        }
        return new Quantity(this._value - other._value);
    }

    equals(other?: Quantity | null): boolean {
        return !!other && other._value === this._value;
    }

    toString(): string {
        return String(this._value);
    }
}
