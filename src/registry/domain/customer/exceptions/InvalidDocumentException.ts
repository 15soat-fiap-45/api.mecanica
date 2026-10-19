import { DomainException } from '../../../../shared/domain/domain-exception.js';

export class InvalidDocumentException extends DomainException {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidDocumentException';
    }
}
