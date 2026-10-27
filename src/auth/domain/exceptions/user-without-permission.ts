import { DomainException } from '../../../shared/domain/domain-exception.js';

export class UserWithoutPermission extends DomainException {
    constructor() {
        super('User does not have this permission');
    }
}
