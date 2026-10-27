import { DomainException } from '../../../shared/domain/domain-exception.js';

export class PermissionDenied extends DomainException {
    constructor() {
        super('Permission denied');
    }
}
