import { ApplicationException } from '../../../shared/application/application-exception.js';

export class UserAlreadyExistsError extends ApplicationException {
    constructor() {
        super('User with this email already exists');
    }
}
