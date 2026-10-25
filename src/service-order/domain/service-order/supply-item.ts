import { DomainException } from '../../../shared/domain/domain-exception.js';
import { PartCode } from '../../../shared/domain/part-code.js';

export class InvalidSupplyItemException extends DomainException {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidSupplyItemException';
    }
}

export class SupplyItemAlreadyUsedException extends DomainException {
    constructor(message = 'Supply item has already been used') {
        super(message);
        this.name = 'SupplyItemAlreadyUsedException';
    }
}

export interface SupplyItemProps {
    partCode: string;
    quantity: number;
    used?: boolean | undefined;
}

/**
 * Internal entity of the ServiceOrder aggregate — not an aggregate root.
 * Identity inside the aggregate is the part code.
 */
export class SupplyItem {
    readonly partCode: string;
    readonly quantity: number;
    private _used: boolean;

    private constructor(props: SupplyItemProps) {
        this.partCode = props.partCode;
        this.quantity = props.quantity;
        this._used = props.used ?? false;
    }

    static create(props: SupplyItemProps): SupplyItem {
        // Same rule as the Stock context (shared PartCode): a code the
        // Stock context cannot store would crash the reservation flow
        // later.
        const partCode = PartCode.parse(props.partCode);
        if (!partCode.ok) {
            throw new InvalidSupplyItemException(partCode.error);
        }
        if (
            typeof props.quantity !== 'number' ||
            !Number.isInteger(props.quantity) ||
            props.quantity <= 0
        ) {
            throw new InvalidSupplyItemException(
                'Quantity must be a positive integer',
            );
        }
        return new SupplyItem({
            partCode: partCode.value.value,
            quantity: props.quantity,
            used: props.used,
        });
    }

    get used(): boolean {
        return this._used;
    }

    markUsed(): void {
        if (this._used) {
            throw new SupplyItemAlreadyUsedException();
        }
        this._used = true;
    }

    equals(other?: SupplyItem | null): boolean {
        return !!other && other.partCode === this.partCode;
    }
}
