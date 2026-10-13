import { DomainException } from '../../../../shared/domain/domain-exception.js';

export class UnidadeMedidaInvalidaException extends DomainException {
    constructor(message: string) {
        super(message);
        this.name = 'UnidadeMedidaInvalidaException';
    }
}

export type TipoUnidadeMedida =
    'UNIDADE' | 'PAR' | 'JOGO' | 'LITRO' | 'QUILOGRAMA' | 'METRO';

export class UnidadeMedida {
    private static readonly VALORES: readonly TipoUnidadeMedida[] = [
        'UNIDADE',
        'PAR',
        'JOGO',
        'LITRO',
        'QUILOGRAMA',
        'METRO',
    ];

    private readonly _value: TipoUnidadeMedida;

    private constructor(value: TipoUnidadeMedida) {
        this._value = value;
        Object.freeze(this);
    }

    /** Creates UnidadeMedida VO or throws UnidadeMedidaInvalidaException */
    static create(input: string): UnidadeMedida {
        const result = UnidadeMedida.parse(input);
        if (!result.ok) throw new UnidadeMedidaInvalidaException(result.error);
        return result.value;
    }

    /** Non-throwing parse method */
    static parse(
        input: string,
    ): { ok: true; value: UnidadeMedida } | { ok: false; error: string } {
        if (typeof input !== 'string') {
            return { ok: false, error: 'Unidade de medida deve ser um texto' };
        }

        const normalized = input.trim().toUpperCase() as TipoUnidadeMedida;

        if (!UnidadeMedida.VALORES.includes(normalized)) {
            return {
                ok: false,
                error: `Unidade de medida inválida. Valores aceitos: ${UnidadeMedida.VALORES.join(', ')}`,
            };
        }

        return { ok: true, value: new UnidadeMedida(normalized) };
    }

    static isValid(input: string): boolean {
        return UnidadeMedida.parse(input).ok;
    }

    get value(): TipoUnidadeMedida {
        return this._value;
    }

    equals(other?: UnidadeMedida | null): boolean {
        return !!other && other._value === this._value;
    }

    toString(): string {
        return this._value;
    }
}
