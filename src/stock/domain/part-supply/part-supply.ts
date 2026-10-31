import { AggregateRoot } from '../../../shared/domain/aggregate-root.js';
import { PartSupplyId } from './part-supply-id.js';
import { PartSupplyRegistered } from './events/part-supply-registered.js';
import {
    type StockEntryReason,
    type StockExitReason,
    StockUpdated,
} from './events/stock-updated.js';
import type { PartCode } from '../../../shared/domain/part-code.js';
import { Quantity } from './value-objects/quantity.js';
import type { UnitOfMeasure } from './value-objects/unit-of-measure.js';
import { DomainException } from '../../../shared/domain/domain-exception.js';

export class InvalidPartPriceException extends DomainException {
    constructor() {
        super('Unit price must be a non-negative integer number of cents');
    }
}

export class InvalidPartDescriptionException extends DomainException {
    constructor() {
        super('Part/supply description must not be empty');
    }
}

function assertValidPrice(unitPriceCents: number): number {
    if (
        typeof unitPriceCents !== 'number' ||
        !Number.isSafeInteger(unitPriceCents) ||
        unitPriceCents < 0
    ) {
        throw new InvalidPartPriceException();
    }
    return unitPriceCents;
}

export interface PartSupplyProps {
    id?: PartSupplyId | string | undefined;
    description: string;
    partCode: PartCode;
    quantity?: Quantity | number | undefined;
    unitOfMeasure: UnitOfMeasure;
    /** Sale price per unit of measure, in cents. */
    unitPriceCents?: number | undefined;
    /** Deactivated parts keep their history but leave the catalog. */
    active?: boolean | undefined;
    version?: number | undefined;
}

export interface PartSupplyDetails {
    description: string;
    unitOfMeasure: UnitOfMeasure;
    unitPriceCents: number;
}

export class PartSupply extends AggregateRoot<PartSupplyId> {
    description: string;
    partCode: PartCode;
    unitOfMeasure: UnitOfMeasure;
    private _unitPriceCents: number;
    private _active: boolean;
    private _quantity: Quantity;

    constructor(
        id: PartSupplyId | string,
        description: string,
        partCode: PartCode,
        quantity: Quantity | number,
        unitOfMeasure: UnitOfMeasure,
        version = 0,
        unitPriceCents = 0,
        active = true,
    ) {
        const partSupplyId =
            id instanceof PartSupplyId ? id : new PartSupplyId(id);
        super(partSupplyId, version);
        this.description = description;
        this.partCode = partCode;
        this._quantity =
            quantity instanceof Quantity ? quantity : Quantity.create(quantity);
        this.unitOfMeasure = unitOfMeasure;
        this._unitPriceCents = assertValidPrice(unitPriceCents);
        this._active = active;
    }

    get unitPriceCents(): number {
        return this._unitPriceCents;
    }

    get active(): boolean {
        return this._active;
    }

    /** Catalog data only: the balance changes through stock movements. */
    updateDetails(details: PartSupplyDetails): void {
        const unitPriceCents = assertValidPrice(details.unitPriceCents);
        const description =
            typeof details.description === 'string'
                ? details.description.trim()
                : '';
        if (!description) throw new InvalidPartDescriptionException();
        this.description = description;
        this.unitOfMeasure = details.unitOfMeasure;
        this._unitPriceCents = unitPriceCents;
    }

    deactivate(): void {
        this._active = false;
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
            props.unitPriceCents ?? 0,
            props.active ?? true,
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
    }
}
