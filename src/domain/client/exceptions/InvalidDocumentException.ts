import { DomainException } from '../../shared/exceptions/DomainException.js';

export class InvalidDocumentException extends DomainException {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidDocumentException';
    }
}
