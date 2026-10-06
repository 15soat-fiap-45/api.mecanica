import { DomainException } from '../../shared/exceptions/DomainException.js';

export class ClientAlreadyExistsError extends DomainException {
    constructor() {
        super('Client with this CPF/CNPJ already exists.');
    }
}
