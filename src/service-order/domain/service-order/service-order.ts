import { AggregateRoot } from '../../../shared/domain/aggregate-root.js';
import { DomainException } from '../../../shared/domain/domain-exception.js';
import { ServiceOrderId } from './service-order-id.js';
import { SupplyItem } from './supply-item.js';
import { ServiceOrderStatus } from './value-objects/service-order-status.js';
import { ServiceOrderRegistered } from './events/service-order-registered.js';
import { AdditionalSuppliesIncluded } from './events/additional-supplies-included.js';
import { SupplyUsed } from './events/supply-used.js';
import { ServiceOrderFinished } from './events/service-order-finished.js';
import { ServiceOrderCancelled } from './events/service-order-cancelled.js';
import { InvalidServiceOrderStatusException } from './value-objects/service-order-status.js';
import { OrderAwaitingApproval } from './events/order-awaiting-approval.js';

export class SupplyItemAlreadyAddedException extends DomainException {
    constructor(message = 'Supply item with this part code already added') {
        super(message);
        this.name = 'SupplyItemAlreadyAddedException';
    }
}

export class SupplyItemNotFoundException extends DomainException {
    constructor(message = 'Supply item not found in this service order') {
        super(message);
        this.name = 'SupplyItemNotFoundException';
    }
}

export interface ServiceOrderProps {
    id?: ServiceOrderId | string | undefined;
    description: string;
    vehicleId?: string | undefined;
    status?: ServiceOrderStatus | undefined;
    items?: SupplyItem[] | undefined;
    version?: number | undefined;
}

export class ServiceOrder extends AggregateRoot<ServiceOrderId> {
    description: string;
    readonly vehicleId: string | null;
    private _status: ServiceOrderStatus;
    private readonly _items: SupplyItem[];

    constructor(
        id: ServiceOrderId | string,
        description: string,
        status: ServiceOrderStatus,
        items: SupplyItem[],
        version = 0,
        vehicleId: string | null = null,
    ) {
        const serviceOrderId =
            id instanceof ServiceOrderId ? id : new ServiceOrderId(id);
        super(serviceOrderId, version);
        this.description = description;
        this.vehicleId = vehicleId;
        this._status = status;
        this._items = items;
    }

    get status(): ServiceOrderStatus {
        return this._status;
    }

    get items(): readonly SupplyItem[] {
        return this._items;
    }

    static create(props: ServiceOrderProps): ServiceOrder {
        const id =
            props.id instanceof ServiceOrderId
                ? props.id
                : new ServiceOrderId(props.id);
        return new ServiceOrder(
            id,
            props.description,
            props.status ?? ServiceOrderStatus.pending(),
            props.items ?? [],
            props.version ?? 0,
            props.vehicleId ?? null,
        );
    }

    static register(props: ServiceOrderProps): ServiceOrder {
        const serviceOrder = ServiceOrder.create(props);
        serviceOrder.record(
            new ServiceOrderRegistered({
                aggregateId: serviceOrder.id.value,
                description: serviceOrder.description,
            }),
        );
        return serviceOrder;
    }

    addSupply(partCode: string, quantity: number): void {
        if (
            this._status.value === 'COMPLETED' ||
            this._status.value === 'CANCELLED'
        ) {
            throw new InvalidServiceOrderStatusException(
                `Cannot add supplies to a ${this._status.value} service order`,
            );
        }

        const item = SupplyItem.create({ partCode, quantity });

        if (this._items.some((existing) => existing.equals(item))) {
            throw new SupplyItemAlreadyAddedException();
        }

        this._items.push(item);
        this.record(
            new AdditionalSuppliesIncluded({
                aggregateId: this.id.value,
                items: [{ partCode: item.partCode, quantity: item.quantity }],
            }),
        );
    }

    markSupplyUsed(partCode: string): void {
        const allowedStatuses = ['APPROVED', 'IN_PROGRESS', 'PAUSED'];
        if (!allowedStatuses.includes(this._status.value)) {
            throw new InvalidServiceOrderStatusException(
                `Cannot mark a supply as used on a ${this._status.value} service order`,
            );
        }

        const normalized = partCode.trim().toUpperCase();
        const item = this._items.find((i) => i.partCode === normalized);
        if (!item) {
            throw new SupplyItemNotFoundException();
        }

        item.markUsed();
        this.record(
            new SupplyUsed({
                aggregateId: this.id.value,
                partCode: item.partCode,
                quantity: item.quantity,
            }),
        );
    }

    approve(): void {
        this._status = this._status.transitionTo('APPROVED');
    }

    reject(): void {
        this._status = this._status.transitionTo('REJECTED');
    }

    awaitApproval(budgetId: string): void {
        this._status = this._status.transitionTo('AWAITING_APPROVAL');
        this.record(
            new OrderAwaitingApproval({
                aggregateId: this.id.value,
                budgetId,
            }),
        );
    }

    startExecution(): void {
        this._status = this._status.transitionTo('IN_PROGRESS');
    }

    finish(): void {
        this._status = this._status.transitionTo('COMPLETED');
        this.record(
            new ServiceOrderFinished({
                aggregateId: this.id.value,
            }),
        );
    }

    deliver(): void {
        this._status = this._status.transitionTo('DELIVERED');
    }

    cancel(): void {
        this._status = this._status.transitionTo('CANCELLED');
        this.record(
            new ServiceOrderCancelled({
                aggregateId: this.id.value,
            }),
        );
    }
}
