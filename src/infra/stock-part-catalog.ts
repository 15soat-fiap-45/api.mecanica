import type { PartCatalog } from '../service-order/application/ports/part-catalog.js';
import type { PartSupplyRepository } from '../stock/domain/part-supply/part-supply.repository.js';

export class StockPartCatalog implements PartCatalog {
    constructor(private readonly parts: PartSupplyRepository) {}

    async findByPartCode(partCode: string) {
        const part = await this.parts.findByPartCode(
            partCode.trim().toUpperCase(),
        );
        // Deactivated parts can no longer be included in service orders.
        return part?.active
            ? {
                  description: part.description,
                  unitPriceCents: part.unitPriceCents,
              }
            : null;
    }
}
