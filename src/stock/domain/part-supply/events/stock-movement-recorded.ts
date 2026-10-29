import { BaseDomainEvent } from '../../../../shared/domain/domain-event.js';

export type StockMovementKind = 'ENTRY' | 'EXIT' | 'ADJUSTMENT';

export type StockMovementRecordedReason =
    'PURCHASE' | 'SERVICE_ORDER' | 'RESERVATION' | 'MANUAL' | 'RETURN';

export interface StockMovementRecordedProps {
    aggregateId: string;
    movementId: string;
    partCode: string;
    movementType: StockMovementKind;
    reason: StockMovementRecordedReason;
    quantity: number;
    quantityBefore: number;
    quantityAfter: number;
    referenceId?: string | undefined;
}

export class StockMovementRecorded extends BaseDomainEvent {
    readonly eventName = 'stock.movement-recorded';
    readonly movementId: string;
    readonly partCode: string;
    readonly movementType: StockMovementKind;
    readonly reason: StockMovementRecordedReason;
    readonly quantity: number;
    readonly quantityBefore: number;
    readonly quantityAfter: number;
    readonly referenceId?: string | undefined;

    constructor(props: StockMovementRecordedProps) {
        super(props.aggregateId);
        this.movementId = props.movementId;
        this.partCode = props.partCode;
        this.movementType = props.movementType;
        this.reason = props.reason;
        this.quantity = props.quantity;
        this.quantityBefore = props.quantityBefore;
        this.quantityAfter = props.quantityAfter;
        this.referenceId = props.referenceId;
        Object.freeze(this);
    }
}
