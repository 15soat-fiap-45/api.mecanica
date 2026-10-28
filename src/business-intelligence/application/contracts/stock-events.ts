import type { DomainEvent } from '../../../shared/domain/domain-event.js';

/**
 * Contract for the event currently emitted by `PartSupply` in the Stock
 * context (`stock.stock-updated`).
 */
export interface StockUpdatedContract extends DomainEvent {
    readonly eventName: 'stock.stock-updated';
    readonly partCode: string;
    readonly movementType: 'ENTRY' | 'EXIT';
    readonly movedQuantity: number;
    readonly previousQuantity: number;
    readonly currentQuantity: number;
}

export type StockMovementReason =
    'PURCHASE' | 'SERVICE_ORDER' | 'RESERVATION' | 'MANUAL' | 'RETURN';

/**
 * Proposed contract for the stock-history feature being developed in another
 * branch (`stock.movement-recorded`). Ready to be wired in the BI composition
 * root once that branch lands.
 */
export interface StockMovementRecordedContract extends DomainEvent {
    readonly eventName: 'stock.movement-recorded';
    readonly movementId: string;
    readonly partCode: string;
    readonly movementType: 'ENTRY' | 'EXIT' | 'ADJUSTMENT';
    readonly reason: StockMovementReason;
    readonly quantity: number;
    readonly quantityBefore: number;
    readonly quantityAfter: number;
    readonly referenceId?: string | undefined;
}
