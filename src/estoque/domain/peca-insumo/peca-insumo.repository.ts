import type { PecaInsumo } from './peca-insumo.js';
import type { PecaInsumoId } from './peca-insumo-id.js';
import type { CodigoPeca } from './value-objects/codigo-peca.js';

export interface PecaInsumoRepository {
    save(pecaInsumo: PecaInsumo): Promise<void>;
    findById(id: PecaInsumoId | string): Promise<PecaInsumo | null>;
    findByCodigoPeca(
        codigoPeca: CodigoPeca | string,
    ): Promise<PecaInsumo | null>;
}
