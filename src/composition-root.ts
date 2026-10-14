import type { EventBus } from './shared/application/event-bus.js';
import type { PecaInsumoRepository } from './estoque/domain/peca-insumo/peca-insumo.repository.js';
import type { ReservaInsumoRepository } from './estoque/domain/reserva-insumo/reserva-insumo.repository.js';
import { CadastrarPecaInsumo } from './estoque/application/use-cases/cadastrar-peca-insumo.js';
import { RegistrarEntradaEmEstoque } from './estoque/application/use-cases/registrar-entrada-em-estoque.js';
import { ReservarInsumo } from './estoque/application/use-cases/reservar-insumo.js';
import { DarBaixaNoEstoque } from './estoque/application/use-cases/dar-baixa-no-estoque.js';
import { VerificarDisponibilidade } from './estoque/application/handlers/verificar-disponibilidade.js';
import type { InsumosAdicionaisIncluidos } from './estoque/application/handlers/verificar-disponibilidade.js';
import { DarBaixaNosInsumosReservados } from './estoque/application/handlers/dar-baixa-nos-insumos-reservados.js';
import type { OsFinalizada } from './estoque/application/handlers/dar-baixa-nos-insumos-reservados.js';

export interface EstoqueDependencies {
    pecaInsumoRepository: PecaInsumoRepository;
    reservaInsumoRepository: ReservaInsumoRepository;
}

/**
 * Composition root do Estoque: instancia os casos de uso e liga cada
 * handler ao seu evento no barramento.
 *
 * - Contratos dos eventos da OS são declarados no próprio Estoque
 *   (ver handlers), sem importar classes do contexto de Ordem de Serviço.
 * - Uma transação por handler: a consistência entre contextos é eventual.
 * - Idempotência garantida nos casos de uso (chave OS + insumo).
 */
export function compositionRoot(eventBus: EventBus, deps: EstoqueDependencies) {
    // Casos de uso
    const cadastrarPecaInsumo = new CadastrarPecaInsumo(
        deps.pecaInsumoRepository,
        eventBus,
    );
    const registrarEntradaEmEstoque = new RegistrarEntradaEmEstoque(
        deps.pecaInsumoRepository,
        eventBus,
    );
    const reservarInsumo = new ReservarInsumo(
        deps.pecaInsumoRepository,
        deps.reservaInsumoRepository,
        eventBus,
    );
    const darBaixaNoEstoque = new DarBaixaNoEstoque(
        deps.reservaInsumoRepository,
    );

    // Handlers de eventos de outros contextos
    const verificarDisponibilidade = new VerificarDisponibilidade(
        reservarInsumo,
        eventBus,
    );
    const darBaixaNosInsumosReservados = new DarBaixaNosInsumosReservados(
        darBaixaNoEstoque,
    );

    eventBus.subscribe<InsumosAdicionaisIncluidos>(
        'ordem-servico.insumos-adicionais-incluidos',
        (event) => verificarDisponibilidade.handle(event),
    );
    eventBus.subscribe<OsFinalizada>('ordem-servico.os-finalizada', (event) =>
        darBaixaNosInsumosReservados.handle(event),
    );

    return {
        cadastrarPecaInsumo,
        registrarEntradaEmEstoque,
        reservarInsumo,
        darBaixaNoEstoque,
    };
}

// Exemplo de uso (na inicialização da aplicação):
//
// const useCases = compositionRoot(eventBus, {
//     pecaInsumoRepository,
//     reservaInsumoRepository,
// });
//
// await useCases.cadastrarPecaInsumo.execute({
//     descricao: 'Pastilha de freio dianteira',
//     codigoPeca: 'PAST-FREIO-01',
//     quantidade: 10,
//     unidadeMedida: 'UNIDADE',
// });
