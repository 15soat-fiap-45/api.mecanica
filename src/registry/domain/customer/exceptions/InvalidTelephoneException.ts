import { DomainException } from '../../../../shared/domain/domain-exception.js';

export class InvalidTelephoneError extends DomainException {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidTelephoneError';
    }
}
