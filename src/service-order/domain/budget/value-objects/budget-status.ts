import { DomainException } from '../../../../shared/domain/domain-exception.js';

export class InvalidBudgetStatusException extends DomainException {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidBudgetStatusException';
    }
}

export type BudgetStatusType = 'PENDING' | 'APPROVED' | 'REJECTED';

const TRANSITIONS: Record<BudgetStatusType, readonly BudgetStatusType[]> = {
    PENDING: ['APPROVED', 'REJECTED'],
    APPROVED: [],
    REJECTED: [],
};

export class BudgetStatus {
    private readonly _value: BudgetStatusType;

    private constructor(value: BudgetStatusType) {
        this._value = value;
        Object.freeze(this);
    }

    /** Creates BudgetStatus VO or throws InvalidBudgetStatusException */
    static create(input: string): BudgetStatus {
        const result = BudgetStatus.parse(input);
        if (!result.ok) throw new InvalidBudgetStatusException(result.error);
        return result.value;
    }

    static pending(): BudgetStatus {
        return new BudgetStatus('PENDING');
    }

    /** Non-throwing parse method */
    static parse(
        input: string,
    ): { ok: true; value: BudgetStatus } | { ok: false; error: string } {
        if (typeof input !== 'string') {
            return { ok: false, error: 'Budget status must be a string' };
        }

        const normalized = input.trim().toUpperCase() as BudgetStatusType;

        if (!(normalized in TRANSITIONS)) {
            return {
                ok: false,
                error: 'Invalid budget status. Accepted values: PENDING, APPROVED, REJECTED',
            };
        }

        return { ok: true, value: new BudgetStatus(normalized) };
    }

    static isValid(input: string): boolean {
        return BudgetStatus.parse(input).ok;
    }

    get value(): BudgetStatusType {
        return this._value;
    }

    canTransitionTo(next: BudgetStatusType): boolean {
        return TRANSITIONS[this._value].includes(next);
    }

    transitionTo(next: BudgetStatusType): BudgetStatus {
        if (!this.canTransitionTo(next)) {
            throw new InvalidBudgetStatusException(
                `Transition from ${this._value} to ${next} is not allowed`,
            );
        }
        return new BudgetStatus(next);
    }

    equals(other?: BudgetStatus | null): boolean {
        return !!other && other._value === this._value;
    }

    toString(): string {
        return this._value;
    }
}
