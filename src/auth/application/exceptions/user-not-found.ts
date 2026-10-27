import { ApplicationException } from '../../../shared/application/application-exception.js';

export class UserNotFound extends ApplicationException {
    constructor() {
        super('User not found');
    }
}
