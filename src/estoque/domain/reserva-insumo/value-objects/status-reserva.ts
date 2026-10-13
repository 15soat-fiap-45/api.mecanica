import { DomainException } from '../../../../shared/domain/domain-exception.js';

export class StatusReservaInvalidoException extends DomainException {
    constructor(message: string) {
        super(message);
        this.name = 'StatusReservaInvalidoException';
    }
}

export type TipoStatusReserva =
    'PENDENTE' | 'CONFIRMADA' | 'CANCELADA' | 'CONSUMIDA';

const TRANSICOES: Record<TipoStatusReserva, readonly TipoStatusReserva[]> = {
    PENDENTE: ['CONFIRMADA', 'CANCELADA'],
    CONFIRMADA: ['CONSUMIDA', 'CANCELADA'],
    CANCELADA: [],
    CONSUMIDA: [],
};

export class StatusReserva {
    private readonly _value: TipoStatusReserva;

    private constructor(value: TipoStatusReserva) {
        this._value = value;
        Object.freeze(this);
    }

    /** Creates StatusReserva VO or throws StatusReservaInvalidoException */
    static create(input: string): StatusReserva {
        const result = StatusReserva.parse(input);
        if (!result.ok) throw new StatusReservaInvalidoException(result.error);
        return result.value;
    }

    static pendente(): StatusReserva {
        return new StatusReserva('PENDENTE');
    }

    /** Non-throwing parse method */
    static parse(
        input: string,
    ): { ok: true; value: StatusReserva } | { ok: false; error: string } {
        if (typeof input !== 'string') {
            return { ok: false, error: 'Status da reserva deve ser um texto' };
        }

        const normalized = input.trim().toUpperCase() as TipoStatusReserva;

        if (!(normalized in TRANSICOES)) {
            return {
                ok: false,
                error: 'Status da reserva inválido. Valores aceitos: PENDENTE, CONFIRMADA, CANCELADA, CONSUMIDA',
            };
        }

        return { ok: true, value: new StatusReserva(normalized) };
    }

    static isValid(input: string): boolean {
        return StatusReserva.parse(input).ok;
    }

    get value(): TipoStatusReserva {
        return this._value;
    }

    podeTransicionarPara(proximo: TipoStatusReserva): boolean {
        return TRANSICOES[this._value].includes(proximo);
    }

    transicionarPara(proximo: TipoStatusReserva): StatusReserva {
        if (!this.podeTransicionarPara(proximo)) {
            throw new StatusReservaInvalidoException(
                `Transição de ${this._value} para ${proximo} não é permitida`,
            );
        }
        return new StatusReserva(proximo);
    }

    equals(other?: StatusReserva | null): boolean {
        return !!other && other._value === this._value;
    }

    toString(): string {
        return this._value;
    }
}
