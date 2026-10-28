import { BaseDomainEvent } from '../../../../shared/domain/domain-event.js';

export type MovementType = 'ENTRY' | 'EXIT';

/**
 * Why the stock moved. Lets consumers tell a real replenishment apart from
 * stock coming back because a reservation was cancelled.
 */
export type StockEntryReason = 'STOCK_ENTRY' | 'RESERVATION_CANCELLED';
export type StockExitReason = 'RESERVATION';
export type StockMovementReason = StockEntryReason | StockExitReason;

export interface StockUpdatedProps {
    aggregateId: string;
    partCode: string;
    movementType: MovementType;
    reason: StockMovementReason;
    movedQuantity: number;
    previousQuantity: number;
    currentQuantity: number;
}

export class StockUpdated extends BaseDomainEvent {
    readonly eventName = 'stock.stock-updated';
    readonly partCode: string;
    readonly movementType: MovementType;
    readonly reason: StockMovementReason;
    readonly movedQuantity: number;
    readonly previousQuantity: number;
    readonly currentQuantity: number;

    constructor(props: StockUpdatedProps) {
        super(props.aggregateId);
        this.partCode = props.partCode;
        this.movementType = props.movementType;
        this.reason = props.reason;
        this.movedQuantity = props.movedQuantity;
        this.previousQuantity = props.previousQuantity;
        this.currentQuantity = props.currentQuantity;
        Object.freeze(this);
    }
}

export { StockUpdated as StockUpdatedEvent };
