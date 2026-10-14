import { AggregateRoot } from '../../../shared/domain/aggregate-root.js';
import { DomainException } from '../../../shared/domain/domain-exception.js';
import { BudgetId } from './budget-id.js';
import { BudgetStatus } from './value-objects/budget-status.js';
import { BudgetApproved } from './events/budget-approved.js';

export class InvalidBudgetException extends DomainException {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidBudgetException';
    }
}

export interface BudgetProps {
    id?: BudgetId | string | undefined;
    serviceOrderId: string;
    total: number;
    status?: BudgetStatus | undefined;
    version?: number | undefined;
}

export class Budget extends AggregateRoot<BudgetId> {
    readonly serviceOrderId: string;
    readonly total: number;
    private _status: BudgetStatus;

    constructor(
        id: BudgetId | string,
        serviceOrderId: string,
        total: number,
        status: BudgetStatus,
        version = 0,
    ) {
        const budgetId = id instanceof BudgetId ? id : new BudgetId(id);
        super(budgetId, version);
        if (typeof total !== 'number' || Number.isNaN(total) || total < 0) {
            throw new InvalidBudgetException('Budget total cannot be negative');
        }
        this.serviceOrderId = serviceOrderId;
        this.total = total;
        this._status = status;
    }

    get status(): BudgetStatus {
        return this._status;
    }

    static create(props: BudgetProps): Budget {
        const id =
            props.id instanceof BudgetId ? props.id : new BudgetId(props.id);
        return new Budget(
            id,
            props.serviceOrderId,
            props.total,
            props.status ?? BudgetStatus.pending(),
            props.version ?? 0,
        );
    }

    approve(): void {
        this._status = this._status.transitionTo('APPROVED');
        this.record(
            new BudgetApproved({
                aggregateId: this.id.value,
                serviceOrderId: this.serviceOrderId,
                total: this.total,
            }),
        );
    }

    reject(): void {
        this._status = this._status.transitionTo('REJECTED');
    }
}
