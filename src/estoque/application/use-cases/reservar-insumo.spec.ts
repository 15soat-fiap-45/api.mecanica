import { describe, expect, it, vi } from 'vitest';
import type { PecaInsumoRepository } from '../../domain/peca-insumo/peca-insumo.repository.js';
import type { ReservaInsumoRepository } from '../../domain/reserva-insumo/reserva-insumo.repository.js';
import { ReservaInsumo } from '../../domain/reserva-insumo/reserva-insumo.js';
import { PecaInsumo } from '../../domain/peca-insumo/peca-insumo.js';
import { CodigoPeca } from '../../domain/peca-insumo/value-objects/codigo-peca.js';
import { QuantidadeInsuficienteException } from '../../domain/peca-insumo/value-objects/quantidade.js';
import { UnidadeMedida } from '../../domain/peca-insumo/value-objects/unidade-medida.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import {
    PecaInsumoNaoEncontradaError,
    ReservarInsumo,
} from './reservar-insumo.js';

describe('ReservarInsumo Use Case', () => {
    const validInput = {
        ordemServicoId: 'os-1',
        codigoPeca: 'PAST-FREIO-01',
        quantidade: 3,
    };

    const makePeca = (): PecaInsumo =>
        PecaInsumo.create({
            id: 'pec-1',
            descricao: 'Pastilha de freio dianteira',
            codigoPeca: CodigoPeca.create(validInput.codigoPeca),
            quantidade: 10,
            unidadeMedida: UnidadeMedida.create('UNIDADE'),
        });

    const makePecaRepository = (
        peca: PecaInsumo | null = makePeca(),
    ): PecaInsumoRepository => ({
        save: vi.fn().mockResolvedValue(undefined),
        findById: vi.fn().mockResolvedValue(null),
        findByCodigoPeca: vi.fn().mockResolvedValue(peca),
    });

    const makeReservaRepository = (
        reservaExistente: ReservaInsumo | null = null,
    ): ReservaInsumoRepository => ({
        save: vi.fn().mockResolvedValue(undefined),
        findById: vi.fn().mockResolvedValue(null),
        findByPecaInsumoId: vi.fn().mockResolvedValue([]),
        findByOrdemServicoId: vi.fn().mockResolvedValue([]),
        findByOrdemServicoIdEPecaInsumo: vi
            .fn()
            .mockResolvedValue(reservaExistente),
    });

    const makeEventBus = (): EventBus => ({
        publish: vi.fn().mockResolvedValue(undefined),
        subscribe: vi.fn(),
    });

    it('should create a reservation, decrease available stock and publish event', async () => {
        const peca = makePeca();
        const pecaRepository = makePecaRepository(peca);
        const reservaRepository = makeReservaRepository();
        const eventBus = makeEventBus();
        const useCase = new ReservarInsumo(
            pecaRepository,
            reservaRepository,
            eventBus,
        );

        const result = await useCase.execute(validInput);

        expect(result).toMatchObject({
            pecaInsumoId: 'pec-1',
            codigoPeca: 'PAST-FREIO-01',
            quantidade: 3,
            status: 'PENDENTE',
            quantidadeDisponivel: 7,
        });
        expect(result.id).toBeTruthy();
        expect(peca.quantidade.value).toBe(7);
        expect(pecaRepository.save).toHaveBeenCalledTimes(1);
        expect(reservaRepository.save).toHaveBeenCalledTimes(1);
        expect(eventBus.publish).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    eventName: 'estoque.estoque-atualizado',
                    tipoMovimentacao: 'SAIDA',
                    quantidadeMovimentada: 3,
                    quantidadeAnterior: 10,
                    quantidadeAtual: 7,
                }),
            ]),
        );
    });

    it('should be idempotent: same OS and insumo do not reserve twice', async () => {
        const peca = makePeca();
        const useCase = new ReservarInsumo(
            makePecaRepository(peca),
            makeReservaRepository(),
        );
        const firstResult = await useCase.execute(validInput);

        // Segunda entrega do mesmo evento: a reserva criada antes é
        // encontrada pela chave OS + insumo.
        const reservaPersistida = ReservaInsumo.create({
            id: firstResult.id,
            pecaInsumoId: 'pec-1',
            ordemServicoId: 'os-1',
            quantidade: 3,
        });
        const pecaRepository = makePecaRepository(peca);
        const reservaRepository = makeReservaRepository(reservaPersistida);
        const secondUseCase = new ReservarInsumo(
            pecaRepository,
            reservaRepository,
        );

        const secondResult = await secondUseCase.execute(validInput);

        expect(secondResult.id).toBe(firstResult.id);
        expect(reservaRepository.save).not.toHaveBeenCalled();
        // estoque não é baixado de novo
        expect(peca.quantidade.value).toBe(7);
    });

    it('should throw PecaInsumoNaoEncontradaError when peca does not exist', async () => {
        const pecaRepository = makePecaRepository(null);
        const reservaRepository = makeReservaRepository();
        const useCase = new ReservarInsumo(pecaRepository, reservaRepository);

        await expect(useCase.execute(validInput)).rejects.toThrow(
            PecaInsumoNaoEncontradaError,
        );
        expect(reservaRepository.save).not.toHaveBeenCalled();
    });

    it('should throw QuantidadeInsuficienteException when stock is not enough', async () => {
        const pecaRepository = makePecaRepository();
        const reservaRepository = makeReservaRepository();
        const useCase = new ReservarInsumo(pecaRepository, reservaRepository);

        await expect(
            useCase.execute({ ...validInput, quantidade: 11 }),
        ).rejects.toThrow(QuantidadeInsuficienteException);
        expect(pecaRepository.save).not.toHaveBeenCalled();
        expect(reservaRepository.save).not.toHaveBeenCalled();
    });
});
