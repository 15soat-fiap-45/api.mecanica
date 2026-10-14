import type { PecaInsumoRepository } from '../../domain/peca-insumo/peca-insumo.repository.js';
import { CodigoPeca } from '../../domain/peca-insumo/value-objects/codigo-peca.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import type { UseCase } from '../../../shared/application/use-case.js';
import { ApplicationException } from '../../../shared/application/application-exception.js';

export class PecaInsumoNaoEncontradaError extends ApplicationException {
    constructor() {
        super('Peça/Insumo não encontrada.');
    }
}

export interface RegistrarEntradaEmEstoqueInput {
    codigoPeca: string;
    quantidade: number;
}

export interface RegistrarEntradaEmEstoqueOutput {
    id: string;
    codigoPeca: string;
    quantidade: number;
}

export class RegistrarEntradaEmEstoque implements UseCase<
    RegistrarEntradaEmEstoqueInput,
    RegistrarEntradaEmEstoqueOutput
> {
    constructor(
        private readonly pecaInsumoRepository: PecaInsumoRepository,
        private readonly eventBus?: EventBus,
    ) {}

    async execute(
        input: RegistrarEntradaEmEstoqueInput,
    ): Promise<RegistrarEntradaEmEstoqueOutput> {
        const codigoPeca = CodigoPeca.create(input.codigoPeca);

        const pecaInsumo =
            await this.pecaInsumoRepository.findByCodigoPeca(codigoPeca);
        if (!pecaInsumo) {
            throw new PecaInsumoNaoEncontradaError();
        }

        pecaInsumo.registrarEntrada(input.quantidade);

        await this.pecaInsumoRepository.save(pecaInsumo);

        if (this.eventBus) {
            await this.eventBus.publish(pecaInsumo.pullEvents());
        }

        return {
            id: pecaInsumo.id.value,
            codigoPeca: pecaInsumo.codigoPeca.value,
            quantidade: pecaInsumo.quantidade.value,
        };
    }
}
