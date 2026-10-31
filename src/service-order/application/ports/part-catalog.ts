export interface PartPricing {
    description: string;
    /** Unit price in cents. */
    unitPriceCents: number;
}

/** Read-only view of the Stock context: price of a part/supply by code. */
export interface PartCatalog {
    findByPartCode(partCode: string): Promise<PartPricing | null>;
}
