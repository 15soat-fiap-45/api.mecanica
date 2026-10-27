import { DomainException } from '../../../shared/domain/domain-exception.js';

export class LastActiveManager extends DomainException {
    constructor() {
        super('Cannot remove the last active manager');
    }
}
