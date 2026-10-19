import { ApplicationException } from '../../../../shared/application/application-exception.js';

export class CustomerAlreadyExistsError extends ApplicationException {
    constructor() {
        super('Customer with this CPF/CNPJ already exists.');
    }
}
