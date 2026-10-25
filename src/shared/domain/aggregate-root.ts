import type { DomainEvent } from './domain-event.js';
import type { Identifier } from './entity-id.js';

/**
 * Raiz de agregado: único ponto de entrada para mudar o estado do agregado
 * e o lugar onde as invariantes são garantidas.
 *
 * - A identidade é qualquer `Identifier`: o Cliente usa o próprio CpfCnpj.
 * - Eventos são acumulados em memória e só publicados depois do commit.
 * - `version` serve para controle otimista de concorrência: o repositório
 *   grava com `WHERE version = :version` e incrementa.
 */
export abstract class AggregateRoot<TId extends Identifier> {
    private events: DomainEvent[] = [];

    protected constructor(
        public readonly id: TId,
        private readonly _version = 0,
    ) {}

    get version(): number {
        return this._version;
    }

    /** Chamado pelos métodos de negócio: this.record(new XCadastrado(...)) */
    protected record(event: DomainEvent): void {
        this.events.push(event);
    }

    /** Chamado pelo caso de uso após persistir; esvazia a lista. */
    pullEvents(): DomainEvent[] {
        const pending = this.events;
        this.events = [];
        return pending;
    }

    equals(other?: AggregateRoot<TId>): boolean {
        return !!other && this.id.equals(other.id);
    }
}
