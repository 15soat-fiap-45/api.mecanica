import { describe, expect, it, vi } from 'vitest';
import type { PecaInsumoRepository } from '../../domain/peca-insumo/peca-insumo.repository.js';
import { PecaInsumo } from '../../domain/peca-insumo/peca-insumo.js';
import { CodigoPeca } from '../../domain/peca-insumo/value-objects/codigo-peca.js';
import { UnidadeMedida } from '../../domain/peca-insumo/value-objects/unidade-medida.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import {
    PecaInsumoNaoEncontradaError,
    RegistrarEntradaEmEstoque,
} from './registrar-entrada-em-estoque.js';

describe('RegistrarEntradaEmEstoque Use Case', () => {
    const validInput = {
        codigoPeca: 'PAST-FREIO-01',
        quantidade: 5,
    };

    const makePeca = (): PecaInsumo =>
        PecaInsumo.create({
            id: 'pec-1',
            descricao: 'Pastilha de freio dianteira',
            codigoPeca: CodigoPeca.create(validInput.codigoPeca),
            quantidade: 10,
            unidadeMedida: UnidadeMedida.create('UNIDADE'),
        });

    const makeRepository = (
        peca: PecaInsumo | null = makePeca(),
    ): PecaInsumoRepository => ({
        save: vi.fn().mockResolvedValue(undefined),
        findById: vi.fn().mockResolvedValue(null),
        findByCodigoPeca: vi.fn().mockResolvedValue(peca),
    });

    const makeEventBus = (): EventBus => ({
        publish: vi.fn().mockResolvedValue(undefined),
        subscribe: vi.fn(),
    });

    it('should increase stock and publish EstoqueAtualizado event', async () => {
        const peca = makePeca();
        const repository = makeRepository(peca);
        const eventBus = makeEventBus();
        const useCase = new RegistrarEntradaEmEstoque(repository, eventBus);

        const result = await useCase.execute(validInput);

        expect(result).toEqual({
            id: 'pec-1',
            codigoPeca: 'PAST-FREIO-01',
            quantidade: 15,
        });
        expect(peca.quantidade.value).toBe(15);
        expect(repository.save).toHaveBeenCalledTimes(1);
        expect(eventBus.publish).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    eventName: 'estoque.estoque-atualizado',
                    tipoMovimentacao: 'ENTRADA',
                    quantidadeMovimentada: 5,
                    quantidadeAnterior: 10,
                    quantidadeAtual: 15,
                }),
            ]),
        );
    });

    it('should throw PecaInsumoNaoEncontradaError when peca does not exist', async () => {
        const repository = makeRepository(null);
        const useCase = new RegistrarEntradaEmEstoque(repository);

        await expect(useCase.execute(validInput)).rejects.toThrow(
            PecaInsumoNaoEncontradaError,
        );
        expect(repository.save).not.toHaveBeenCalled();
    });
});
