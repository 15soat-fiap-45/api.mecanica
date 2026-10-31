import { AggregateRoot } from '../../../shared/domain/aggregate-root.js';
import { DomainException } from '../../../shared/domain/domain-exception.js';
import { ServiceOrderId } from './service-order-id.js';
import { SupplyItem } from './supply-item.js';
import { ServiceItem, type ServiceItemProps } from './service-item.js';
import { ServiceOrderStatus } from './value-objects/service-order-status.js';
import { ServiceOrderRegistered } from './events/service-order-registered.js';
import { AdditionalSuppliesIncluded } from './events/additional-supplies-included.js';
import { SupplyUsed } from './events/supply-used.js';
import { ServiceOrderFinished } from './events/service-order-finished.js';
import { ServiceOrderCancelled } from './events/service-order-cancelled.js';
import { InvalidServiceOrderStatusException } from './value-objects/service-order-status.js';
import { OrderAwaitingApproval } from './events/order-awaiting-approval.js';
import { ServiceOrderExecutionStarted } from './events/service-order-execution-started.js';
import { ServiceOrderDelivered } from './events/service-order-delivered.js';

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

export class ServiceItemAlreadyAddedException extends DomainException {
    constructor(message = 'Service already added to this service order') {
        super(message);
    }
}

export class ServiceItemNotFoundException extends DomainException {
    constructor(message = 'Service not found in this service order') {
        super(message);
    }
}

export class InvalidServiceOrderDescriptionException extends DomainException {
    constructor() {
        super('Service order description must not be empty');
    }
}

export interface ServiceOrderProps {
    id?: ServiceOrderId | string | undefined;
    description: string;
    vehicleId?: string | undefined;
    status?: ServiceOrderStatus | undefined;
    items?: SupplyItem[] | undefined;
    services?: ServiceItem[] | undefined;
    version?: number | undefined;
}

export interface SupplyPricing {
    description?: string | null | undefined;
    unitPriceCents: number;
}

export class ServiceOrder extends AggregateRoot<ServiceOrderId> {
    description: string;
    readonly vehicleId: string | null;
    private _status: ServiceOrderStatus;
    private readonly _items: SupplyItem[];
    private readonly _services: ServiceItem[];

    constructor(
        id: ServiceOrderId | string,
        description: string,
        status: ServiceOrderStatus,
        items: SupplyItem[],
        version = 0,
        vehicleId: string | null = null,
        services: ServiceItem[] = [],
    ) {
        const serviceOrderId =
            id instanceof ServiceOrderId ? id : new ServiceOrderId(id);
        super(serviceOrderId, version);
        this.description = description;
        this.vehicleId = vehicleId;
        this._status = status;
        this._items = items;
        this._services = services;
    }

    /** Budget amount: catalog services plus parts/supplies (qty x unit price). */
    get totalCents(): number {
        return (
            this._services.reduce((sum, item) => sum + item.priceCents, 0) +
            this._items.reduce((sum, item) => sum + item.totalCents, 0)
        );
    }

    get status(): ServiceOrderStatus {
        return this._status;
    }

    get items(): readonly SupplyItem[] {
        return this._items;
    }

    get services(): readonly ServiceItem[] {
        return this._services;
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
            props.services ?? [],
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

    updateDescription(description: string): void {
        this.assertPending('update description on');
        if (typeof description !== 'string' || !description.trim()) {
            throw new InvalidServiceOrderDescriptionException();
        }
        this.description = description.trim();
    }

    /** Services are part of the diagnosis: only while the order is PENDING. */
    addService(props: ServiceItemProps): void {
        this.assertPending('add services to');
        const item = ServiceItem.create(props);
        if (this._services.some((existing) => existing.equals(item))) {
            throw new ServiceItemAlreadyAddedException();
        }
        this._services.push(item);
    }

    removeService(serviceId: string): void {
        this.assertPending('remove services from');
        const index = this._services.findIndex(
            (item) => item.serviceId === serviceId,
        );
        if (index < 0) throw new ServiceItemNotFoundException();
        this._services.splice(index, 1);
    }

    addSupply(
        partCode: string,
        quantity: number,
        pricing?: SupplyPricing,
    ): void {
        if (this._status.isClosed()) {
            throw new InvalidServiceOrderStatusException(
                `Cannot add supplies to a ${this._status.value} service order`,
            );
        }

        const item = SupplyItem.create({
            partCode,
            quantity,
            description: pricing?.description,
            unitPriceCents: pricing?.unitPriceCents,
        });

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

    private assertPending(action: string): void {
        if (this._status.value !== 'PENDING') {
            throw new InvalidServiceOrderStatusException(
                `Cannot ${action} a ${this._status.value} service order`,
            );
        }
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
        this.record(
            new ServiceOrderExecutionStarted({
                aggregateId: this.id.value,
            }),
        );
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
        this.record(
            new ServiceOrderDelivered({
                aggregateId: this.id.value,
            }),
        );
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
