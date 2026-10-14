import { describe, expect, it, vi } from 'vitest';
import type { ReservaInsumoRepository } from '../../domain/reserva-insumo/reserva-insumo.repository.js';
import { ReservaInsumo } from '../../domain/reserva-insumo/reserva-insumo.js';
import { DarBaixaNoEstoque } from './dar-baixa-no-estoque.js';

describe('DarBaixaNoEstoque Use Case', () => {
    const validInput = { ordemServicoId: 'os-1' };

    const makeRepository = (
        reservas: ReservaInsumo[],
    ): ReservaInsumoRepository => ({
        save: vi.fn().mockResolvedValue(undefined),
        findById: vi.fn().mockResolvedValue(null),
        findByPecaInsumoId: vi.fn().mockResolvedValue([]),
        findByOrdemServicoId: vi.fn().mockResolvedValue(reservas),
        findByOrdemServicoIdEPecaInsumo: vi.fn().mockResolvedValue(null),
    });

    it('should consume pending and confirmed reservations of the OS', async () => {
        const pendente = ReservaInsumo.create({
            id: 'res-1',
            pecaInsumoId: 'pec-1',
            ordemServicoId: 'os-1',
            quantidade: 3,
        });
        const confirmada = ReservaInsumo.create({
            id: 'res-2',
            pecaInsumoId: 'pec-2',
            ordemServicoId: 'os-1',
            quantidade: 1,
        });
        confirmada.confirmar();

        const repository = makeRepository([pendente, confirmada]);
        const useCase = new DarBaixaNoEstoque(repository);

        const result = await useCase.execute(validInput);

        expect(result.ordemServicoId).toBe('os-1');
        expect(result.itensBaixados).toEqual([
            {
                reservaId: 'res-1',
                pecaInsumoId: 'pec-1',
                quantidade: 3,
                status: 'CONSUMIDA',
            },
            {
                reservaId: 'res-2',
                pecaInsumoId: 'pec-2',
                quantidade: 1,
                status: 'CONSUMIDA',
            },
        ]);
        expect(repository.save).toHaveBeenCalledTimes(2);
    });

    it('should be idempotent: already consumed or cancelled reservations are skipped', async () => {
        const consumida = ReservaInsumo.create({
            id: 'res-1',
            pecaInsumoId: 'pec-1',
            ordemServicoId: 'os-1',
            quantidade: 3,
        });
        consumida.confirmar();
        consumida.consumir();

        const cancelada = ReservaInsumo.create({
            id: 'res-2',
            pecaInsumoId: 'pec-2',
            ordemServicoId: 'os-1',
            quantidade: 1,
        });
        cancelada.cancelar();

        // Simula a segunda entrega do evento "OS finalizada".
        const repository = makeRepository([consumida, cancelada]);
        const useCase = new DarBaixaNoEstoque(repository);

        const result = await useCase.execute(validInput);

        expect(result.itensBaixados).toEqual([]);
        expect(repository.save).not.toHaveBeenCalled();
    });

    it('should return an empty result when the OS has no reservations', async () => {
        const repository = makeRepository([]);
        const useCase = new DarBaixaNoEstoque(repository);

        const result = await useCase.execute(validInput);

        expect(result).toEqual({ ordemServicoId: 'os-1', itensBaixados: [] });
        expect(repository.save).not.toHaveBeenCalled();
    });
});
