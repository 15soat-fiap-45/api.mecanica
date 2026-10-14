import { describe, expect, it, vi } from 'vitest';
import type { PecaInsumoRepository } from '../../domain/peca-insumo/peca-insumo.repository.js';
import type { ReservaInsumoRepository } from '../../domain/reserva-insumo/reserva-insumo.repository.js';
import type { ReservaInsumo } from '../../domain/reserva-insumo/reserva-insumo.js';
import { PecaInsumo } from '../../domain/peca-insumo/peca-insumo.js';
import { CodigoPeca } from '../../domain/peca-insumo/value-objects/codigo-peca.js';
import { UnidadeMedida } from '../../domain/peca-insumo/value-objects/unidade-medida.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import { ReservarInsumo } from '../use-cases/reservar-insumo.js';
import {
    VerificarDisponibilidade,
    type InsumosAdicionaisIncluidos,
} from './verificar-disponibilidade.js';

describe('VerificarDisponibilidade Handler', () => {
    const makeEvent = (
        itens: InsumosAdicionaisIncluidos['itens'],
    ): InsumosAdicionaisIncluidos => ({
        eventId: 'evt-1',
        eventName: 'ordem-servico.insumos-adicionais-incluidos',
        occurredOn: new Date(),
        aggregateId: 'os-1',
        itens,
    });

    const makePeca = (quantidade = 10): PecaInsumo =>
        PecaInsumo.create({
            id: 'pec-1',
            descricao: 'Pastilha de freio dianteira',
            codigoPeca: CodigoPeca.create('PAST-FREIO-01'),
            quantidade,
            unidadeMedida: UnidadeMedida.create('UNIDADE'),
        });

    const makePecaRepository = (
        peca: PecaInsumo | null,
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

    const makeHandler = (
        peca: PecaInsumo | null,
        reservaExistente: ReservaInsumo | null = null,
    ) => {
        const pecaRepository = makePecaRepository(peca);
        const reservaRepository = makeReservaRepository(reservaExistente);
        const eventBus = makeEventBus();
        const reservarInsumo = new ReservarInsumo(
            pecaRepository,
            reservaRepository,
            eventBus,
        );
        const handler = new VerificarDisponibilidade(reservarInsumo, eventBus);
        return { handler, pecaRepository, reservaRepository, eventBus };
    };

    it('should reserve every item when stock is available', async () => {
        const peca = makePeca();
        const { handler, reservaRepository, eventBus } = makeHandler(peca);

        await handler.handle(
            makeEvent([{ codigoPeca: 'PAST-FREIO-01', quantidade: 2 }]),
        );

        expect(peca.quantidade.value).toBe(8);
        expect(reservaRepository.save).toHaveBeenCalledTimes(1);
        // nenhum AguardandoReposicao foi publicado
        for (const call of vi.mocked(eventBus.publish).mock.calls) {
            const published = Array.isArray(call[0]) ? call[0] : [call[0]];
            for (const domainEvent of published) {
                expect(domainEvent.eventName).not.toBe(
                    'estoque.aguardando-reposicao',
                );
            }
        }
    });

    it('should publish AguardandoReposicao when the peca does not exist', async () => {
        const { handler, reservaRepository, eventBus } = makeHandler(null);

        await handler.handle(
            makeEvent([{ codigoPeca: 'PAST-FREIO-01', quantidade: 2 }]),
        );

        expect(reservaRepository.save).not.toHaveBeenCalled();
        expect(eventBus.publish).toHaveBeenCalledTimes(1);
        expect(eventBus.publish).toHaveBeenCalledWith(
            expect.objectContaining({
                eventName: 'estoque.aguardando-reposicao',
                aggregateId: 'os-1',
                itensPendentes: [
                    { codigoPeca: 'PAST-FREIO-01', quantidadeSolicitada: 2 },
                ],
            }),
        );
    });

    it('should publish AguardandoReposicao when stock is not enough', async () => {
        const peca = makePeca(1);
        const { handler, reservaRepository, eventBus } = makeHandler(peca);

        await handler.handle(
            makeEvent([{ codigoPeca: 'PAST-FREIO-01', quantidade: 5 }]),
        );

        // estoque não é alterado e nenhuma reserva é criada
        expect(peca.quantidade.value).toBe(1);
        expect(reservaRepository.save).not.toHaveBeenCalled();
        expect(eventBus.publish).toHaveBeenCalledWith(
            expect.objectContaining({
                eventName: 'estoque.aguardando-reposicao',
                itensPendentes: [
                    { codigoPeca: 'PAST-FREIO-01', quantidadeSolicitada: 5 },
                ],
            }),
        );
    });

    it('should be idempotent: handling the same event twice does not reserve twice', async () => {
        const peca = makePeca();
        const { handler, reservaRepository } = makeHandler(peca);

        const event = makeEvent([
            { codigoPeca: 'PAST-FREIO-01', quantidade: 3 },
        ]);
        await handler.handle(event);

        // Segunda entrega: a reserva persistida é encontrada pela chave OS + insumo.
        vi.mocked(
            reservaRepository.findByOrdemServicoIdEPecaInsumo,
        ).mockResolvedValue(
            // a única reserva salva na primeira execução
            vi.mocked(reservaRepository.save).mock
                .calls[0]?.[0] as ReservaInsumo,
        );
        await handler.handle(event);

        expect(reservaRepository.save).toHaveBeenCalledTimes(1);
        expect(peca.quantidade.value).toBe(7);
    });

    it('should rethrow unexpected errors', async () => {
        const peca = makePeca();
        const pecaRepository = makePecaRepository(peca);
        vi.mocked(pecaRepository.save).mockRejectedValue(new Error('db down'));
        const reservaRepository = makeReservaRepository();
        const eventBus = makeEventBus();
        const handler = new VerificarDisponibilidade(
            new ReservarInsumo(pecaRepository, reservaRepository, eventBus),
            eventBus,
        );

        await expect(
            handler.handle(
                makeEvent([{ codigoPeca: 'PAST-FREIO-01', quantidade: 2 }]),
            ),
        ).rejects.toThrow('db down');
    });
});
