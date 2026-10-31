import { DomainException } from '../../../shared/domain/domain-exception.js';

export class InvalidCatalogEntryException extends DomainException {}

export const SERVICE_TYPE_NAME_MAX_LENGTH = 50;
export const SERVICE_NAME_MAX_LENGTH = 100;
export const SERVICE_DESCRIPTION_MAX_LENGTH = 500;

export function requireName(value: string, maxLength: number): string {
    const name = typeof value === 'string' ? value.trim() : '';
    if (!name || name.length > maxLength) {
        throw new InvalidCatalogEntryException(
            `Name must have between 1 and ${maxLength} characters`,
        );
    }
    return name;
}

export function optionalDescription(
    value: string | null | undefined,
): string | null {
    if (value === null || value === undefined) return null;
    const description = value.trim();
    if (description.length > SERVICE_DESCRIPTION_MAX_LENGTH) {
        throw new InvalidCatalogEntryException(
            `Description must have at most ${SERVICE_DESCRIPTION_MAX_LENGTH} characters`,
        );
    }
    return description || null;
}

/** Prices travel as integer cents, never as floating-point numbers. */
export function requirePriceCents(value: number): number {
    if (
        typeof value !== 'number' ||
        !Number.isSafeInteger(value) ||
        value < 0
    ) {
        throw new InvalidCatalogEntryException(
            'Price must be a non-negative integer number of cents',
        );
    }
    return value;
}
