import type { StockMovement } from '../../domain/restock-cycle/stock-movement.js';
import type {
    StockMovementRecordedContract,
    StockUpdatedContract,
} from '../contracts/stock-events.js';

/**
 * Adapts the current `stock.stock-updated` event into the neutral
 * `StockMovement` model used by the BI restock projection.
 */
export function fromStockUpdated(event: StockUpdatedContract): StockMovement {
    return {
        partCode: event.partCode.trim().toUpperCase(),
        type: event.movementType,
        quantity: event.movedQuantity,
        quantityBefore: event.previousQuantity,
        quantityAfter: event.currentQuantity,
        occurredOn: new Date(event.occurredOn),
    };
}

/**
 * Adapts the proposed `stock.movement-recorded` event from the upcoming
 * stock-history module into the neutral `StockMovement` model.
 */
export function fromStockMovementRecorded(
    event: StockMovementRecordedContract,
): StockMovement {
    return {
        partCode: event.partCode.trim().toUpperCase(),
        type: event.movementType,
        quantity: event.quantity,
        quantityBefore: event.quantityBefore,
        quantityAfter: event.quantityAfter,
        occurredOn: new Date(event.occurredOn),
        reason: event.reason,
        movementId: event.movementId,
    };
}
