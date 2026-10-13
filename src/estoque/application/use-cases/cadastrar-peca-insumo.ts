import type { PecaInsumoRepository } from '../../domain/peca-insumo/peca-insumo.repository.js';
import { PecaInsumo } from '../../domain/peca-insumo/peca-insumo.js';
import { CodigoPeca } from '../../domain/peca-insumo/value-objects/codigo-peca.js';
import { UnidadeMedida } from '../../domain/peca-insumo/value-objects/unidade-medida.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import type { UseCase } from '../../../shared/application/use-case.js';
import { ApplicationException } from '../../../shared/application/application-exception.js';

export class PecaInsumoJaCadastradaError extends ApplicationException {
    constructor(message = 'Peça/Insumo com este código já cadastrada.') {
        super(message);
    }
}

export interface CadastrarPecaInsumoInput {
    id?: string | undefined;
    descricao: string;
    codigoPeca: string;
    quantidade?: number | undefined;
    unidadeMedida: string;
}

export interface CadastrarPecaInsumoOutput {
    id: string;
    descricao: string;
    codigoPeca: string;
    quantidade: number;
    unidadeMedida: string;
}

export class CadastrarPecaInsumo implements UseCase<
    CadastrarPecaInsumoInput,
    CadastrarPecaInsumoOutput
> {
    constructor(
        private readonly pecaInsumoRepository: PecaInsumoRepository,
        private readonly eventBus?: EventBus,
    ) {}

    async execute(
        input: CadastrarPecaInsumoInput,
    ): Promise<CadastrarPecaInsumoOutput> {
        const codigoPeca = CodigoPeca.create(input.codigoPeca);

        const existentePorCodigo =
            await this.pecaInsumoRepository.findByCodigoPeca(codigoPeca);
        if (existentePorCodigo) {
            throw new PecaInsumoJaCadastradaError();
        }

        if (input.id) {
            const existentePorId = await this.pecaInsumoRepository.findById(
                input.id,
            );
            if (existentePorId) {
                throw new PecaInsumoJaCadastradaError(
                    'Peça/Insumo com este ID já cadastrada.',
                );
            }
        }

        const unidadeMedida = UnidadeMedida.create(input.unidadeMedida);

        const pecaInsumo = PecaInsumo.cadastrar({
            id: input.id,
            descricao: input.descricao,
            codigoPeca,
            quantidade: input.quantidade,
            unidadeMedida,
        });

        await this.pecaInsumoRepository.save(pecaInsumo);

        if (this.eventBus) {
            await this.eventBus.publish(pecaInsumo.pullEvents());
        }

        return {
            id: pecaInsumo.id.value,
            descricao: pecaInsumo.descricao,
            codigoPeca: pecaInsumo.codigoPeca.value,
            quantidade: pecaInsumo.quantidade.value,
            unidadeMedida: pecaInsumo.unidadeMedida.value,
        };
    }
}
