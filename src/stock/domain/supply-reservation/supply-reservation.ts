import { AggregateRoot } from '../../../shared/domain/aggregate-root.js';
import { SupplyReservationId } from './supply-reservation-id.js';
import { PartSupplyId } from '../part-supply/part-supply-id.js';
import { Quantity } from '../part-supply/value-objects/quantity.js';
import { ReservationStatus } from './value-objects/reservation-status.js';

export interface SupplyReservationProps {
    id?: SupplyReservationId | string | undefined;
    partSupplyId: PartSupplyId | string;
    serviceOrderId: string;
    quantity: Quantity | number;
    status?: ReservationStatus | undefined;
    version?: number | undefined;
}

export class SupplyReservation extends AggregateRoot<SupplyReservationId> {
    readonly partSupplyId: PartSupplyId;
    readonly serviceOrderId: string;
    readonly quantity: Quantity;
    private _status: ReservationStatus;

    constructor(
        id: SupplyReservationId | string,
        partSupplyId: PartSupplyId | string,
        serviceOrderId: string,
        quantity: Quantity | number,
        status: ReservationStatus,
        version = 0,
    ) {
        const supplyReservationId =
            id instanceof SupplyReservationId
                ? id
                : new SupplyReservationId(id);
        super(supplyReservationId, version);
        this.partSupplyId =
            partSupplyId instanceof PartSupplyId
                ? partSupplyId
                : new PartSupplyId(partSupplyId);
        this.serviceOrderId = serviceOrderId;
        this.quantity =
            quantity instanceof Quantity ? quantity : Quantity.create(quantity);
        this._status = status;
    }

    get status(): ReservationStatus {
        return this._status;
    }

    static create(props: SupplyReservationProps): SupplyReservation {
        const id =
            props.id instanceof SupplyReservationId
                ? props.id
                : new SupplyReservationId(props.id);
        return new SupplyReservation(
            id,
            props.partSupplyId,
            props.serviceOrderId,
            props.quantity,
            props.status ?? ReservationStatus.pending(),
            props.version ?? 0,
        );
    }

    confirm(): void {
        this._status = this._status.transitionTo('CONFIRMED');
    }

    cancel(): void {
        this._status = this._status.transitionTo('CANCELLED');
    }

    consume(): void {
        this._status = this._status.transitionTo('CONSUMED');
    }
}
