import { AggregateRoot } from '../../../shared/domain/aggregate-root.js';
import { PartSupplyId } from './part-supply-id.js';
import { PartSupplyRegistered } from './events/part-supply-registered.js';
import {
    type StockEntryReason,
    type StockExitReason,
    StockUpdated,
} from './events/stock-updated.js';
import {
    type StockMovementKind,
    type StockMovementRecordedReason,
    StockMovementRecorded,
} from './events/stock-movement-recorded.js';
import type { PartCode } from '../../../shared/domain/part-code.js';
import { Quantity } from './value-objects/quantity.js';
import type { UnitOfMeasure } from './value-objects/unit-of-measure.js';

export interface PartSupplyProps {
    id?: PartSupplyId | string | undefined;
    description: string;
    partCode: PartCode;
    quantity?: Quantity | number | undefined;
    unitOfMeasure: UnitOfMeasure;
    version?: number | undefined;
}

const movementReasons: Record<
    StockEntryReason | StockExitReason,
    StockMovementRecordedReason
> = {
    STOCK_ENTRY: 'PURCHASE',
    RESERVATION: 'RESERVATION',
    RESERVATION_CANCELLED: 'RETURN',
};

export class PartSupply extends AggregateRoot<PartSupplyId> {
    description: string;
    partCode: PartCode;
    unitOfMeasure: UnitOfMeasure;
    private _quantity: Quantity;

    constructor(
        id: PartSupplyId | string,
        description: string,
        partCode: PartCode,
        quantity: Quantity | number,
        unitOfMeasure: UnitOfMeasure,
        version = 0,
    ) {
        const partSupplyId =
            id instanceof PartSupplyId ? id : new PartSupplyId(id);
        super(partSupplyId, version);
        this.description = description;
        this.partCode = partCode;
        this._quantity =
            quantity instanceof Quantity ? quantity : Quantity.create(quantity);
        this.unitOfMeasure = unitOfMeasure;
    }

    get quantity(): Quantity {
        return this._quantity;
    }

    static create(props: PartSupplyProps): PartSupply {
        const id =
            props.id instanceof PartSupplyId
                ? props.id
                : new PartSupplyId(props.id);
        return new PartSupply(
            id,
            props.description,
            props.partCode,
            props.quantity ?? Quantity.zero(),
            props.unitOfMeasure,
            props.version ?? 0,
        );
    }

    static register(props: PartSupplyProps): PartSupply {
        const partSupply = PartSupply.create(props);
        partSupply.record(
            new PartSupplyRegistered({
                aggregateId: partSupply.id.value,
                description: partSupply.description,
                partCode: partSupply.partCode.value,
                initialQuantity: partSupply.quantity.value,
                unitOfMeasure: partSupply.unitOfMeasure.value,
            }),
        );
        return partSupply;
    }

    registerEntry(
        quantity: Quantity | number,
        reason: StockEntryReason = 'STOCK_ENTRY',
    ): void {
        const moved =
            quantity instanceof Quantity ? quantity : Quantity.create(quantity);
        const previous = this._quantity;
        this._quantity = this._quantity.add(moved);
        this.record(
            new StockUpdated({
                aggregateId: this.id.value,
                partCode: this.partCode.value,
                movementType: 'ENTRY',
                reason,
                movedQuantity: moved.value,
                previousQuantity: previous.value,
                currentQuantity: this._quantity.value,
            }),
        );
        this.recordMovement('ENTRY', reason, moved, previous);
    }

    deduct(
        quantity: Quantity | number,
        reason: StockExitReason = 'RESERVATION',
    ): void {
        const moved =
            quantity instanceof Quantity ? quantity : Quantity.create(quantity);
        const previous = this._quantity;
        this._quantity = this._quantity.subtract(moved);
        this.record(
            new StockUpdated({
                aggregateId: this.id.value,
                partCode: this.partCode.value,
                movementType: 'EXIT',
                reason,
                movedQuantity: moved.value,
                previousQuantity: previous.value,
                currentQuantity: this._quantity.value,
            }),
        );
        this.recordMovement('EXIT', reason, moved, previous);
    }

    private recordMovement(
        movementType: StockMovementKind,
        reason: StockEntryReason | StockExitReason,
        moved: Quantity,
        previous: Quantity,
    ): void {
        this.record(
            new StockMovementRecorded({
                aggregateId: this.id.value,
                movementId: crypto.randomUUID(),
                partCode: this.partCode.value,
                movementType,
                reason: movementReasons[reason],
                quantity: moved.value,
                quantityBefore: previous.value,
                quantityAfter: this._quantity.value,
            }),
        );
    }
}
