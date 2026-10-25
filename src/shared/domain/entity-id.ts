import { DomainException } from './domain-exception.js';

export class InvalidIdException extends DomainException {
    constructor() {
        super('Identificador não pode ser vazio');
    }
}

/**
 * Contrato mínimo de qualquer identidade de agregado. Não impõe o tipo da
 * chave: pode ser um UUID (EntityId) ou um value object natural, como o
 * CpfCnpj, que é a chave primária do Cliente.
 */
export interface Identifier {
    equals(other?: Identifier): boolean;
    toString(): string;
}

/**
 * Base opcional para ids sintéticos (OrdemServicoId, OrcamentoId...).
 * Ids distintos não são intercambiáveis: passar um OrdemServicoId onde se
 * espera um OrcamentoId vira erro de compilação.
 */
export abstract class EntityId implements Identifier {
    protected constructor(public readonly value: string) {
        if (!value || !value.trim()) throw new InvalidIdException();
    }

    equals(other?: EntityId): boolean {
        return (
            !!other &&
            other.constructor === this.constructor &&
            other.value === this.value
        );
    }

    toString(): string {
        return this.value;
    }
}

// export class OrdemServicoId extends EntityId {
//   static novo(): OrdemServicoId { return new OrdemServicoId(randomUUID()); }
//   static de(value: string): OrdemServicoId { return new OrdemServicoId(value); }
// }
