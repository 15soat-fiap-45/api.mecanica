import { DomainException } from '../../../../shared/domain/domain-exception.js';

export class QuantidadeInvalidaException extends DomainException {
    constructor(message: string) {
        super(message);
        this.name = 'QuantidadeInvalidaException';
    }
}

export class QuantidadeInsuficienteException extends DomainException {
    constructor(message = 'Quantidade em estoque insuficiente') {
        super(message);
        this.name = 'QuantidadeInsuficienteException';
    }
}

export class Quantidade {
    private readonly _value: number;

    private constructor(value: number) {
        this._value = value;
        Object.freeze(this);
    }

    /** Creates Quantidade VO or throws QuantidadeInvalidaException */
    static create(input: number): Quantidade {
        const result = Quantidade.parse(input);
        if (!result.ok) throw new QuantidadeInvalidaException(result.error);
        return result.value;
    }

    static zero(): Quantidade {
        return new Quantidade(0);
    }

    /** Non-throwing parse method */
    static parse(
        input: number,
    ): { ok: true; value: Quantidade } | { ok: false; error: string } {
        if (typeof input !== 'number' || Number.isNaN(input)) {
            return { ok: false, error: 'Quantidade deve ser um número' };
        }

        if (!Number.isInteger(input)) {
            return {
                ok: false,
                error: 'Quantidade deve ser um número inteiro',
            };
        }

        if (input < 0) {
            return { ok: false, error: 'Quantidade não pode ser negativa' };
        }

        return { ok: true, value: new Quantidade(input) };
    }

    static isValid(input: number): boolean {
        return Quantidade.parse(input).ok;
    }

    get value(): number {
        return this._value;
    }

    somar(outra: Quantidade): Quantidade {
        return new Quantidade(this._value + outra._value);
    }

    subtrair(outra: Quantidade): Quantidade {
        if (outra._value > this._value) {
            throw new QuantidadeInsuficienteException();
        }
        return new Quantidade(this._value - outra._value);
    }

    equals(other?: Quantidade | null): boolean {
        return !!other && other._value === this._value;
    }

    toString(): string {
        return String(this._value);
    }
}
