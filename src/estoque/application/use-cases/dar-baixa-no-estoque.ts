import type { ReservaInsumoRepository } from '../../domain/reserva-insumo/reserva-insumo.repository.js';
import type { UseCase } from '../../../shared/application/use-case.js';

export interface DarBaixaNoEstoqueInput {
    ordemServicoId: string;
}

export interface ItemBaixado {
    reservaId: string;
    pecaInsumoId: string;
    quantidade: number;
    status: string;
}

export interface DarBaixaNoEstoqueOutput {
    ordemServicoId: string;
    itensBaixados: ItemBaixado[];
}

/**
 * Dá baixa definitiva no estoque consumindo as reservas da OS.
 * A quantidade já saiu do estoque disponível no momento da reserva;
 * a baixa apenas confirma o consumo do material.
 *
 * Idempotente: reservas já CONSUMIDAS ou CANCELADAS são ignoradas, então
 * o evento "OS finalizada" pode chegar duas vezes sem efeito colateral.
 */
export class DarBaixaNoEstoque implements UseCase<
    DarBaixaNoEstoqueInput,
    DarBaixaNoEstoqueOutput
> {
    constructor(
        private readonly reservaInsumoRepository: ReservaInsumoRepository,
    ) {}

    async execute(
        input: DarBaixaNoEstoqueInput,
    ): Promise<DarBaixaNoEstoqueOutput> {
        const reservas =
            await this.reservaInsumoRepository.findByOrdemServicoId(
                input.ordemServicoId,
            );

        const itensBaixados: ItemBaixado[] = [];

        for (const reserva of reservas) {
            if (
                reserva.status.value === 'CONSUMIDA' ||
                reserva.status.value === 'CANCELADA'
            ) {
                continue;
            }

            if (reserva.status.value === 'PENDENTE') {
                reserva.confirmar();
            }
            reserva.consumir();

            await this.reservaInsumoRepository.save(reserva);

            itensBaixados.push({
                reservaId: reserva.id.value,
                pecaInsumoId: reserva.pecaInsumoId.value,
                quantidade: reserva.quantidade.value,
                status: reserva.status.value,
            });
        }

        return { ordemServicoId: input.ordemServicoId, itensBaixados };
    }
}
