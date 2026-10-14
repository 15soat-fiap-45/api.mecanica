import { DomainException } from '../../../../shared/domain/domain-exception.js';

export class InvalidServiceOrderStatusException extends DomainException {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidServiceOrderStatusException';
    }
}

export type ServiceOrderStatusType =
    | 'PENDING'
    | 'APPROVED'
    | 'IN_PROGRESS'
    | 'PAUSED'
    | 'COMPLETED'
    | 'CANCELLED';

const TRANSITIONS: Record<
    ServiceOrderStatusType,
    readonly ServiceOrderStatusType[]
> = {
    PENDING: ['APPROVED', 'CANCELLED'],
    APPROVED: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['PAUSED', 'COMPLETED', 'CANCELLED'],
    PAUSED: ['IN_PROGRESS', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
};

export class ServiceOrderStatus {
    private readonly _value: ServiceOrderStatusType;

    private constructor(value: ServiceOrderStatusType) {
        this._value = value;
        Object.freeze(this);
    }

    /** Creates ServiceOrderStatus VO or throws InvalidServiceOrderStatusException */
    static create(input: string): ServiceOrderStatus {
        const result = ServiceOrderStatus.parse(input);
        if (!result.ok) {
            throw new InvalidServiceOrderStatusException(result.error);
        }
        return result.value;
    }

    static pending(): ServiceOrderStatus {
        return new ServiceOrderStatus('PENDING');
    }

    /** Non-throwing parse method */
    static parse(
        input: string,
    ): { ok: true; value: ServiceOrderStatus } | { ok: false; error: string } {
        if (typeof input !== 'string') {
            return {
                ok: false,
                error: 'Service order status must be a string',
            };
        }

        const normalized = input.trim().toUpperCase() as ServiceOrderStatusType;

        if (!(normalized in TRANSITIONS)) {
            return {
                ok: false,
                error: 'Invalid service order status. Accepted values: PENDING, APPROVED, IN_PROGRESS, PAUSED, COMPLETED, CANCELLED',
            };
        }

        return { ok: true, value: new ServiceOrderStatus(normalized) };
    }

    static isValid(input: string): boolean {
        return ServiceOrderStatus.parse(input).ok;
    }

    get value(): ServiceOrderStatusType {
        return this._value;
    }

    canTransitionTo(next: ServiceOrderStatusType): boolean {
        return TRANSITIONS[this._value].includes(next);
    }

    transitionTo(next: ServiceOrderStatusType): ServiceOrderStatus {
        if (!this.canTransitionTo(next)) {
            throw new InvalidServiceOrderStatusException(
                `Transition from ${this._value} to ${next} is not allowed`,
            );
        }
        return new ServiceOrderStatus(next);
    }

    equals(other?: ServiceOrderStatus | null): boolean {
        return !!other && other._value === this._value;
    }

    toString(): string {
        return this._value;
    }
}
