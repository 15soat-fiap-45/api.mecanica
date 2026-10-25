import { DomainException } from '../../../../shared/domain/domain-exception.js';

export class InvalidPasswordException extends DomainException {}

export class Password {
    private constructor(public readonly value: string) {
        Object.freeze(this);
    }

    static create(value: string): Password {
        if (typeof value !== 'string' || !/^[a-zA-Z0-9]{8,}$/.test(value)) {
            throw new InvalidPasswordException(
                'Password must be at least 8 alphanumeric characters',
            );
        }
        return new Password(value);
    }
}
