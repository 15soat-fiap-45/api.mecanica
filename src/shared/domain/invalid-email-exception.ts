import { DomainException } from './domain-exception.js';

export class InvalidEmailException extends DomainException {
    constructor(message: string) {
        super(message);
        this.name = 'Invalid Email';
    }
}
