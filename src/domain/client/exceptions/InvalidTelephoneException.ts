import { DomainException } from '../../shared/exceptions/DomainException.js';

export class InvalidTelephoneError extends DomainException {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidTelephoneError';
    }
}
