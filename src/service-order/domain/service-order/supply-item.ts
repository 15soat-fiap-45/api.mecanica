import { DomainException } from '../../../shared/domain/domain-exception.js';

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
        if (!props.partCode || !props.partCode.trim()) {
            throw new InvalidSupplyItemException('Part code cannot be empty');
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
            partCode: props.partCode.trim().toUpperCase(),
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
