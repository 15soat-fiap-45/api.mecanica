export type StockMovementKind = 'ENTRY' | 'EXIT' | 'ADJUSTMENT';

/**
 * Neutral representation of a stock movement inside the BI context.
 *
 * Adapters translate external events (today's `stock.stock-updated` or the
 * future `stock.movement-recorded` from the stock-history team) into this
 * structure so the restock policy and projection handlers stay decoupled
 * from the upstream event schema.
 */
export interface StockMovement {
    readonly partCode: string;
    readonly type: StockMovementKind;
    readonly quantity: number;
    readonly quantityBefore: number;
    readonly quantityAfter: number;
    readonly occurredOn: Date;
    readonly reason?: string | undefined;
    readonly movementId?: string | undefined;
}
