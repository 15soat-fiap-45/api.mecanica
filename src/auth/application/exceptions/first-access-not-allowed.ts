import { ApplicationException } from '../../../shared/application/application-exception.js';

export class FirstAccessNotAllowed extends ApplicationException {
    constructor() {
        super('First access is not allowed');
    }
}
