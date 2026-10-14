import { BaseDomainEvent } from '../../../../shared/domain/domain-event.js';

export type TipoMovimentacao = 'ENTRADA' | 'SAIDA';

export interface EstoqueAtualizadoProps {
    aggregateId: string;
    codigoPeca: string;
    tipoMovimentacao: TipoMovimentacao;
    quantidadeMovimentada: number;
    quantidadeAnterior: number;
    quantidadeAtual: number;
}

export class EstoqueAtualizado extends BaseDomainEvent {
    readonly eventName = 'estoque.estoque-atualizado';
    readonly codigoPeca: string;
    readonly tipoMovimentacao: TipoMovimentacao;
    readonly quantidadeMovimentada: number;
    readonly quantidadeAnterior: number;
    readonly quantidadeAtual: number;

    constructor(props: EstoqueAtualizadoProps) {
        super(props.aggregateId);
        this.codigoPeca = props.codigoPeca;
        this.tipoMovimentacao = props.tipoMovimentacao;
        this.quantidadeMovimentada = props.quantidadeMovimentada;
        this.quantidadeAnterior = props.quantidadeAnterior;
        this.quantidadeAtual = props.quantidadeAtual;
        Object.freeze(this);
    }
}

export { EstoqueAtualizado as EstoqueAtualizadoEvent };
