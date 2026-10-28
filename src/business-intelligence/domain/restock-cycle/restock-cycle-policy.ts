import { DomainException } from '../../../shared/domain/domain-exception.js';
import type { StockMovement } from './stock-movement.js';

export class InvalidReorderPointException extends DomainException {
    constructor(
        message = 'Reorder point must be a non-negative integer quantity',
    ) {
        super(message);
        this.name = 'InvalidReorderPointException';
    }
}

/**
 * Pluggable rule that defines when a restock cycle starts and when it ends.
 *
 * Because the stock-history feature is still being developed by another team,
 * keeping this rule behind a strategy allows swapping the calculation (e.g.
 * ignoring manual adjustments, using per-part minimum stock, or measuring
 * purchase-order → entry) without rewriting the projection or use cases.
 */
export interface RestockCyclePolicy {
    readonly name: string;
    opensCycle(movement: StockMovement): boolean;
    closesCycle(movement: StockMovement): boolean;
    describe(): { name: string; [key: string]: unknown };
}

/**
 * Default policy:
 * - A cycle OPENS when an outward movement (`EXIT`) brings the stock to or
 *   below `reorderPoint` (default `0`, i.e. stockout).
 * - A cycle CLOSES on the next `ENTRY` that lifts the stock strictly above
 *   `reorderPoint`.
 * - Manual adjustments with reason `MANUAL` (when provided by the future
 *   stock-history event) do not close a restock cycle.
 */
export class ReorderPointRestockPolicy implements RestockCyclePolicy {
    readonly name = 'REORDER_POINT';
    readonly reorderPoint: number;

    constructor(reorderPoint = 0) {
        if (!Number.isInteger(reorderPoint) || reorderPoint < 0) {
            throw new InvalidReorderPointException();
        }
        this.reorderPoint = reorderPoint;
        Object.freeze(this);
    }

    opensCycle(movement: StockMovement): boolean {
        return (
            movement.type === 'EXIT' &&
            movement.quantityAfter <= this.reorderPoint
        );
    }

    closesCycle(movement: StockMovement): boolean {
        if (movement.reason === 'MANUAL') return false;
        return (
            movement.type === 'ENTRY' &&
            movement.quantityAfter > this.reorderPoint
        );
    }

    describe(): { name: string; reorderPoint: number } {
        return {
            name: this.name,
            reorderPoint: this.reorderPoint,
        };
    }
}
