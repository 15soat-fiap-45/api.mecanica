import { DomainException } from '../../shared/exceptions/DomainException.js';

export class InvalidEmailException extends DomainException {
    constructor(message: string) {
        super(message);
        this.name = 'Invalid Email';
    }
}
