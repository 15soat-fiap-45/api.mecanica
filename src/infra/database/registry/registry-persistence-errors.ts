import { ApplicationException } from '../../../shared/application/application-exception.js';

export class RegistryAlreadyExistsError extends ApplicationException {
    constructor(resource: 'customer' | 'vehicle') {
        super(`A ${resource} with the requested unique value already exists.`);
    }
}

export class CustomerHasVehiclesError extends ApplicationException {
    constructor() {
        super('Cannot delete customer while vehicles are linked to it.');
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

export function isForeignKeyViolation(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23503'
    );
}
