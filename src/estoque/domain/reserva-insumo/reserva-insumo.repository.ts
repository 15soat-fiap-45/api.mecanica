import type { ReservaInsumo } from './reserva-insumo.js';
import type { ReservaInsumoId } from './reserva-insumo-id.js';
import type { PecaInsumoId } from '../peca-insumo/peca-insumo-id.js';

export interface ReservaInsumoRepository {
    save(reservaInsumo: ReservaInsumo): Promise<void>;
    findById(id: ReservaInsumoId | string): Promise<ReservaInsumo | null>;
    findByPecaInsumoId(
        pecaInsumoId: PecaInsumoId | string,
    ): Promise<ReservaInsumo[]>;
    findByOrdemServicoId(ordemServicoId: string): Promise<ReservaInsumo[]>;
    findByOrdemServicoIdEPecaInsumo(
        ordemServicoId: string,
        pecaInsumoId: PecaInsumoId | string,
    ): Promise<ReservaInsumo | null>;
}
