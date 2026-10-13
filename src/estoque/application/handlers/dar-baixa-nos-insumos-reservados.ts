import type { DomainEvent } from '../../../shared/domain/domain-event.js';
import { DarBaixaNoEstoque } from '../use-cases/dar-baixa-no-estoque.js';

/**
 * Contrato do evento da OS declarado no próprio contexto Estoque — o
 * consumidor define o formato que espera, sem importar nada do domínio
 * de Ordem de Serviço. Os contextos ficam desacoplados.
 */
export interface OsFinalizada extends DomainEvent {
    readonly eventName: 'ordem-servico.os-finalizada';
}

/**
 * Handler do evento "OS finalizada" de Ordem de Serviço: delega ao caso
 * de uso DarBaixaNoEstoque, que consome as reservas da OS.
 *
 * Roda em sua própria transação: a consistência entre os contextos é
 * eventual. O caso de uso é idempotente — reservas já CONSUMIDAS ou
 * CANCELADAS são ignoradas se o evento chegar duas vezes.
 */
export class DarBaixaNosInsumosReservados {
    constructor(private readonly darBaixaNoEstoque: DarBaixaNoEstoque) {}

    async handle(event: OsFinalizada): Promise<void> {
        await this.darBaixaNoEstoque.execute({
            ordemServicoId: event.aggregateId,
        });
    }
}
