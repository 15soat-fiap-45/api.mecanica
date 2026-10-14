import { describe, expect, it, vi } from 'vitest';
import type { ReservaInsumoRepository } from '../../domain/reserva-insumo/reserva-insumo.repository.js';
import { ReservaInsumo } from '../../domain/reserva-insumo/reserva-insumo.js';
import { DarBaixaNoEstoque } from '../use-cases/dar-baixa-no-estoque.js';
import {
    DarBaixaNosInsumosReservados,
    type OsFinalizada,
} from './dar-baixa-nos-insumos-reservados.js';

describe('DarBaixaNosInsumosReservados Handler', () => {
    const makeEvent = (): OsFinalizada => ({
        eventId: 'evt-1',
        eventName: 'ordem-servico.os-finalizada',
        occurredOn: new Date(),
        aggregateId: 'os-1',
    });

    const makeRepository = (
        reservas: ReservaInsumo[],
    ): ReservaInsumoRepository => ({
        save: vi.fn().mockResolvedValue(undefined),
        findById: vi.fn().mockResolvedValue(null),
        findByPecaInsumoId: vi.fn().mockResolvedValue([]),
        findByOrdemServicoId: vi.fn().mockResolvedValue(reservas),
        findByOrdemServicoIdEPecaInsumo: vi.fn().mockResolvedValue(null),
    });

    it('should consume the OS reservations through the DarBaixaNoEstoque use case', async () => {
        const reserva = ReservaInsumo.create({
            id: 'res-1',
            pecaInsumoId: 'pec-1',
            ordemServicoId: 'os-1',
            quantidade: 2,
        });
        const repository = makeRepository([reserva]);
        const handler = new DarBaixaNosInsumosReservados(
            new DarBaixaNoEstoque(repository),
        );

        await handler.handle(makeEvent());

        expect(reserva.status.value).toBe('CONSUMIDA');
        expect(repository.save).toHaveBeenCalledTimes(1);
        expect(repository.findByOrdemServicoId).toHaveBeenCalledWith('os-1');
    });

    it('should be idempotent: a duplicated OS finalizada event has no side effects', async () => {
        const reserva = ReservaInsumo.create({
            id: 'res-1',
            pecaInsumoId: 'pec-1',
            ordemServicoId: 'os-1',
            quantidade: 2,
        });
        const repository = makeRepository([reserva]);
        const handler = new DarBaixaNosInsumosReservados(
            new DarBaixaNoEstoque(repository),
        );

        await handler.handle(makeEvent());
        await handler.handle(makeEvent());

        expect(reserva.status.value).toBe('CONSUMIDA');
        // save só na primeira entrega
        expect(repository.save).toHaveBeenCalledTimes(1);
    });

    it('should do nothing when the OS has no reservations', async () => {
        const repository = makeRepository([]);
        const handler = new DarBaixaNosInsumosReservados(
            new DarBaixaNoEstoque(repository),
        );

        await expect(handler.handle(makeEvent())).resolves.toBeUndefined();
        expect(repository.save).not.toHaveBeenCalled();
    });
});
