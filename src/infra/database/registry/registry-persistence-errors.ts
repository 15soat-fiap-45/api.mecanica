import { ApplicationException } from '../../../shared/application/application-exception.js';

export class RegistryAlreadyExistsError extends ApplicationException {
    constructor(resource: 'customer' | 'vehicle') {
        super(`A ${resource} with the requested unique value already exists.`);
    }
}

export function isUniqueConstraintViolation(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
    );
}
