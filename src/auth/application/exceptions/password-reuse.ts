import { ApplicationException } from '../../../shared/application/application-exception.js';

export class PasswordReuse extends ApplicationException {
    constructor() {
        super('New password must differ from temporary password');
    }
}
