import type { PartSupply } from './part-supply.js';
import type { PartSupplyId } from './part-supply-id.js';
import type { PartCode } from './value-objects/part-code.js';

export interface PartSupplyRepository {
    save(partSupply: PartSupply): Promise<void>;
    findById(id: PartSupplyId | string): Promise<PartSupply | null>;
    findByPartCode(partCode: PartCode | string): Promise<PartSupply | null>;
}
