import { ApplicationException } from '../../shared/application-exception.js';

export class ClientAlreadyExistsError extends ApplicationException {
    constructor() {
        super('Client with this CPF/CNPJ already exists.');
    }
}
