import { BaseDomainEvent } from '../../../shared/domain/domain-event.js';
import type { DomainEvent } from '../../../shared/domain/domain-event.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import { QuantidadeInsuficienteException } from '../../domain/peca-insumo/value-objects/quantidade.js';
import {
    PecaInsumoNaoEncontradaError,
    ReservarInsumo,
} from '../use-cases/reservar-insumo.js';

/**
 * Contrato do evento da OS declarado no próprio contexto Estoque — o
 * consumidor define o formato que espera, sem importar nada do domínio
 * de Ordem de Serviço. Os contextos ficam desacoplados.
 */
export interface ItemInsumoIncluido {
    readonly codigoPeca: string;
    readonly quantidade: number;
}

export interface InsumosAdicionaisIncluidos extends DomainEvent {
    readonly eventName: 'ordem-servico.insumos-adicionais-incluidos';
    readonly itens: readonly ItemInsumoIncluido[];
}

export interface ItemAguardandoReposicao {
    readonly codigoPeca: string;
    readonly quantidadeSolicitada: number;
}

export interface AguardandoReposicaoProps {
    aggregateId: string;
    itensPendentes: ItemAguardandoReposicao[];
}

/** Evento publicado para a OS aguardar reposição dos insumos em falta. */
export class AguardandoReposicao extends BaseDomainEvent {
    readonly eventName = 'estoque.aguardando-reposicao';
    readonly itensPendentes: ItemAguardandoReposicao[];

    constructor(props: AguardandoReposicaoProps) {
        super(props.aggregateId);
        this.itensPendentes = props.itensPendentes;
        Object.freeze(this);
    }
}

/**
 * Handler do evento "insumos adicionais incluídos" da OS.
 *
 * Tenta reservar cada item; se não houver estoque, publica
 * AguardandoReposicao para a OS aguardar reposição.
 *
 * Roda em sua própria transação: a consistência entre os contextos é
 * eventual (existe um intervalo entre a OS registrar o insumo e o
 * Estoque reservá-lo). A idempotência é garantida no caso de uso
 * ReservarInsumo (chave OS + insumo).
 */
export class VerificarDisponibilidade {
    constructor(
        private readonly reservarInsumo: ReservarInsumo,
        private readonly eventBus: EventBus,
    ) {}

    async handle(event: InsumosAdicionaisIncluidos): Promise<void> {
        const itensPendentes: ItemAguardandoReposicao[] = [];

        for (const item of event.itens) {
            try {
                await this.reservarInsumo.execute({
                    ordemServicoId: event.aggregateId,
                    codigoPeca: item.codigoPeca,
                    quantidade: item.quantidade,
                });
            } catch (error) {
                if (
                    error instanceof PecaInsumoNaoEncontradaError ||
                    error instanceof QuantidadeInsuficienteException
                ) {
                    itensPendentes.push({
                        codigoPeca: item.codigoPeca,
                        quantidadeSolicitada: item.quantidade,
                    });
                    continue;
                }
                throw error;
            }
        }

        if (itensPendentes.length > 0) {
            await this.eventBus.publish(
                new AguardandoReposicao({
                    aggregateId: event.aggregateId,
                    itensPendentes,
                }),
            );
        }
    }
}
