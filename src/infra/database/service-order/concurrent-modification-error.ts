import { ApplicationException } from '../../../shared/application/application-exception.js';

export class ConcurrentModificationError extends ApplicationException {
    constructor() {
        super('The resource was changed by another request. Reload and retry.');
    }
}
