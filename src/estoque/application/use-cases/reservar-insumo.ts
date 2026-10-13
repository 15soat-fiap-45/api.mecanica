import type { PecaInsumoRepository } from '../../domain/peca-insumo/peca-insumo.repository.js';
import type { ReservaInsumoRepository } from '../../domain/reserva-insumo/reserva-insumo.repository.js';
import { ReservaInsumo } from '../../domain/reserva-insumo/reserva-insumo.js';
import { CodigoPeca } from '../../domain/peca-insumo/value-objects/codigo-peca.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import type { UseCase } from '../../../shared/application/use-case.js';
import { ApplicationException } from '../../../shared/application/application-exception.js';

export class PecaInsumoNaoEncontradaError extends ApplicationException {
    constructor() {
        super('Peça/Insumo não encontrada.');
    }
}

export interface ReservarInsumoInput {
    ordemServicoId: string;
    codigoPeca: string;
    quantidade: number;
}

export interface ReservarInsumoOutput {
    id: string;
    pecaInsumoId: string;
    codigoPeca: string;
    quantidade: number;
    status: string;
    quantidadeDisponivel: number;
}

export class ReservarInsumo implements UseCase<
    ReservarInsumoInput,
    ReservarInsumoOutput
> {
    constructor(
        private readonly pecaInsumoRepository: PecaInsumoRepository,
        private readonly reservaInsumoRepository: ReservaInsumoRepository,
        private readonly eventBus?: EventBus,
    ) {}

    async execute(input: ReservarInsumoInput): Promise<ReservarInsumoOutput> {
        const codigoPeca = CodigoPeca.create(input.codigoPeca);

        const pecaInsumo =
            await this.pecaInsumoRepository.findByCodigoPeca(codigoPeca);
        if (!pecaInsumo) {
            throw new PecaInsumoNaoEncontradaError();
        }

        // Idempotência: o evento pode chegar duas vezes — mesma OS e mesmo
        // insumo não podem reservar em dobro.
        const reservaExistente =
            await this.reservaInsumoRepository.findByOrdemServicoIdEPecaInsumo(
                input.ordemServicoId,
                pecaInsumo.id,
            );
        if (reservaExistente) {
            return {
                id: reservaExistente.id.value,
                pecaInsumoId: pecaInsumo.id.value,
                codigoPeca: pecaInsumo.codigoPeca.value,
                quantidade: reservaExistente.quantidade.value,
                status: reservaExistente.status.value,
                quantidadeDisponivel: pecaInsumo.quantidade.value,
            };
        }

        // A reserva retira a quantidade do estoque disponível
        pecaInsumo.darBaixa(input.quantidade);

        const reserva = ReservaInsumo.create({
            pecaInsumoId: pecaInsumo.id,
            ordemServicoId: input.ordemServicoId,
            quantidade: input.quantidade,
        });

        await this.pecaInsumoRepository.save(pecaInsumo);
        await this.reservaInsumoRepository.save(reserva);

        if (this.eventBus) {
            await this.eventBus.publish(pecaInsumo.pullEvents());
        }

        return {
            id: reserva.id.value,
            pecaInsumoId: pecaInsumo.id.value,
            codigoPeca: pecaInsumo.codigoPeca.value,
            quantidade: reserva.quantidade.value,
            status: reserva.status.value,
            quantidadeDisponivel: pecaInsumo.quantidade.value,
        };
    }
}
