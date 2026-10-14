import { BaseDomainEvent } from '../../../../shared/domain/domain-event.js';

export interface PecaInsumoCadastradaProps {
    aggregateId: string;
    descricao: string;
    codigoPeca: string;
    quantidadeInicial: number;
    unidadeMedida: string;
}

export class PecaInsumoCadastrada extends BaseDomainEvent {
    readonly eventName = 'estoque.peca-insumo-cadastrada';
    readonly descricao: string;
    readonly codigoPeca: string;
    readonly quantidadeInicial: number;
    readonly unidadeMedida: string;

    constructor(props: PecaInsumoCadastradaProps) {
        super(props.aggregateId);
        this.descricao = props.descricao;
        this.codigoPeca = props.codigoPeca;
        this.quantidadeInicial = props.quantidadeInicial;
        this.unidadeMedida = props.unidadeMedida;
        Object.freeze(this);
    }
}

export { PecaInsumoCadastrada as PecaInsumoCadastradaEvent };
