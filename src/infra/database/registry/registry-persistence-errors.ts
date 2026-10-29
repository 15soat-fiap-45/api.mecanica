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

// O Drizzle encapsula o erro do driver pg em DrizzleQueryError, com o
// código SQLSTATE em `cause`; por isso a cadeia de causas é percorrida.
function hasPostgresErrorCode(error: unknown, code: string): boolean {
    let current: unknown = error;
    for (let depth = 0; depth < 5; depth++) {
        if (typeof current !== 'object' || current === null) return false;
        if ('code' in current && current.code === code) return true;
        current = 'cause' in current ? current.cause : undefined;
    }
    return false;
}

export function isUniqueConstraintViolation(error: unknown): boolean {
    return hasPostgresErrorCode(error, '23505');
}

export function isForeignKeyViolation(error: unknown): boolean {
    return hasPostgresErrorCode(error, '23503');
}
