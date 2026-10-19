import { BaseDomainEvent } from '../../../../shared/domain/domain-event.js';

export type MovementType = 'ENTRY' | 'EXIT';

export interface StockUpdatedProps {
    aggregateId: string;
    partCode: string;
    movementType: MovementType;
    movedQuantity: number;
    previousQuantity: number;
    currentQuantity: number;
}

export class StockUpdated extends BaseDomainEvent {
    readonly eventName = 'stock.stock-updated';
    readonly partCode: string;
    readonly movementType: MovementType;
    readonly movedQuantity: number;
    readonly previousQuantity: number;
    readonly currentQuantity: number;

    constructor(props: StockUpdatedProps) {
        super(props.aggregateId);
        this.partCode = props.partCode;
        this.movementType = props.movementType;
        this.movedQuantity = props.movedQuantity;
        this.previousQuantity = props.previousQuantity;
        this.currentQuantity = props.currentQuantity;
        Object.freeze(this);
    }
}

export { StockUpdated as StockUpdatedEvent };
