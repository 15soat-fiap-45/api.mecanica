import { AggregateRoot } from '../../../shared/domain/aggregate-root.js';
import { PecaInsumoId } from './peca-insumo-id.js';
import { PecaInsumoCadastrada } from './events/peca-insumo-cadastrada.js';
import { EstoqueAtualizado } from './events/estoque-atualizado.js';
import type { CodigoPeca } from './value-objects/codigo-peca.js';
import { Quantidade } from './value-objects/quantidade.js';
import type { UnidadeMedida } from './value-objects/unidade-medida.js';

export interface PecaInsumoProps {
    id?: PecaInsumoId | string | undefined;
    descricao: string;
    codigoPeca: CodigoPeca;
    quantidade?: Quantidade | number | undefined;
    unidadeMedida: UnidadeMedida;
    version?: number | undefined;
}

export class PecaInsumo extends AggregateRoot<PecaInsumoId> {
    descricao: string;
    codigoPeca: CodigoPeca;
    unidadeMedida: UnidadeMedida;
    private _quantidade: Quantidade;

    constructor(
        id: PecaInsumoId | string,
        descricao: string,
        codigoPeca: CodigoPeca,
        quantidade: Quantidade | number,
        unidadeMedida: UnidadeMedida,
        version = 0,
    ) {
        const pecaInsumoId =
            id instanceof PecaInsumoId ? id : new PecaInsumoId(id);
        super(pecaInsumoId, version);
        this.descricao = descricao;
        this.codigoPeca = codigoPeca;
        this._quantidade =
            quantidade instanceof Quantidade
                ? quantidade
                : Quantidade.create(quantidade);
        this.unidadeMedida = unidadeMedida;
    }

    get quantidade(): Quantidade {
        return this._quantidade;
    }

    static create(props: PecaInsumoProps): PecaInsumo {
        const id =
            props.id instanceof PecaInsumoId
                ? props.id
                : new PecaInsumoId(props.id);
        return new PecaInsumo(
            id,
            props.descricao,
            props.codigoPeca,
            props.quantidade ?? Quantidade.zero(),
            props.unidadeMedida,
            props.version ?? 0,
        );
    }

    static cadastrar(props: PecaInsumoProps): PecaInsumo {
        const pecaInsumo = PecaInsumo.create(props);
        pecaInsumo.record(
            new PecaInsumoCadastrada({
                aggregateId: pecaInsumo.id.value,
                descricao: pecaInsumo.descricao,
                codigoPeca: pecaInsumo.codigoPeca.value,
                quantidadeInicial: pecaInsumo.quantidade.value,
                unidadeMedida: pecaInsumo.unidadeMedida.value,
            }),
        );
        return pecaInsumo;
    }

    registrarEntrada(quantidade: Quantidade | number): void {
        const movimentada =
            quantidade instanceof Quantidade
                ? quantidade
                : Quantidade.create(quantidade);
        const anterior = this._quantidade;
        this._quantidade = this._quantidade.somar(movimentada);
        this.record(
            new EstoqueAtualizado({
                aggregateId: this.id.value,
                codigoPeca: this.codigoPeca.value,
                tipoMovimentacao: 'ENTRADA',
                quantidadeMovimentada: movimentada.value,
                quantidadeAnterior: anterior.value,
                quantidadeAtual: this._quantidade.value,
            }),
        );
    }

    darBaixa(quantidade: Quantidade | number): void {
        const movimentada =
            quantidade instanceof Quantidade
                ? quantidade
                : Quantidade.create(quantidade);
        const anterior = this._quantidade;
        this._quantidade = this._quantidade.subtrair(movimentada);
        this.record(
            new EstoqueAtualizado({
                aggregateId: this.id.value,
                codigoPeca: this.codigoPeca.value,
                tipoMovimentacao: 'SAIDA',
                quantidadeMovimentada: movimentada.value,
                quantidadeAnterior: anterior.value,
                quantidadeAtual: this._quantidade.value,
            }),
        );
    }
}
