import { ApplicationException } from '../../../shared/application/application-exception.js';

export class InvalidCredentials extends ApplicationException {
    constructor() {
        super('Invalid credentials');
    }
}
