import { DomainException } from '../../../../shared/domain/domain-exception.js';

export class InvalidReservationStatusException extends DomainException {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidReservationStatusException';
    }
}

export type ReservationStatusType =
    'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'CONSUMED';

const TRANSITIONS: Record<
    ReservationStatusType,
    readonly ReservationStatusType[]
> = {
    PENDING: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['CONSUMED', 'CANCELLED'],
    CANCELLED: [],
    CONSUMED: [],
};

export class ReservationStatus {
    private readonly _value: ReservationStatusType;

    private constructor(value: ReservationStatusType) {
        this._value = value;
        Object.freeze(this);
    }

    /** Creates ReservationStatus VO or throws InvalidReservationStatusException */
    static create(input: string): ReservationStatus {
        const result = ReservationStatus.parse(input);
        if (!result.ok) {
            throw new InvalidReservationStatusException(result.error);
        }
        return result.value;
    }

    static pending(): ReservationStatus {
        return new ReservationStatus('PENDING');
    }

    /** Non-throwing parse method */
    static parse(
        input: string,
    ): { ok: true; value: ReservationStatus } | { ok: false; error: string } {
        if (typeof input !== 'string') {
            return { ok: false, error: 'Reservation status must be a string' };
        }

        const normalized = input.trim().toUpperCase() as ReservationStatusType;

        if (!(normalized in TRANSITIONS)) {
            return {
                ok: false,
                error: 'Invalid reservation status. Accepted values: PENDING, CONFIRMED, CANCELLED, CONSUMED',
            };
        }

        return { ok: true, value: new ReservationStatus(normalized) };
    }

    static isValid(input: string): boolean {
        return ReservationStatus.parse(input).ok;
    }

    get value(): ReservationStatusType {
        return this._value;
    }

    canTransitionTo(next: ReservationStatusType): boolean {
        return TRANSITIONS[this._value].includes(next);
    }

    transitionTo(next: ReservationStatusType): ReservationStatus {
        if (!this.canTransitionTo(next)) {
            throw new InvalidReservationStatusException(
                `Transition from ${this._value} to ${next} is not allowed`,
            );
        }
        return new ReservationStatus(next);
    }

    equals(other?: ReservationStatus | null): boolean {
        return !!other && other._value === this._value;
    }

    toString(): string {
        return this._value;
    }
}
