import { ApplicationException } from '../../shared/application-exception.js';

export class CustomerAlreadyExistsError extends ApplicationException {
    constructor() {
        super('Customer with this CPF/CNPJ already exists.');
    }
}
