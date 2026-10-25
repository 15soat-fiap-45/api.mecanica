import { ApplicationException } from '../../../shared/application/application-exception.js';

export class FirstAccessRequired extends ApplicationException {
    constructor() {
        super('First access password reset required');
    }
}
