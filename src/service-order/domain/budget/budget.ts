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
    totalCents: number;
    status?: BudgetStatus | undefined;
    version?: number | undefined;
}

/**
 * Money is stored as integer cents: 0.1 + 0.2 !== 0.3 with floats, so
 * prices never travel the system as floating-point numbers.
 */
export class Budget extends AggregateRoot<BudgetId> {
    readonly serviceOrderId: string;
    readonly totalCents: number;
    private _status: BudgetStatus;

    constructor(
        id: BudgetId | string,
        serviceOrderId: string,
        totalCents: number,
        status: BudgetStatus,
        version = 0,
    ) {
        const budgetId = id instanceof BudgetId ? id : new BudgetId(id);
        super(budgetId, version);
        if (
            typeof totalCents !== 'number' ||
            Number.isNaN(totalCents) ||
            !Number.isInteger(totalCents) ||
            totalCents < 0
        ) {
            throw new InvalidBudgetException(
                'Budget total must be a non-negative integer number of cents',
            );
        }
        this.serviceOrderId = serviceOrderId;
        this.totalCents = totalCents;
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
            props.totalCents,
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
                totalCents: this.totalCents,
            }),
        );
    }

    reject(): void {
        this._status = this._status.transitionTo('REJECTED');
    }
}
