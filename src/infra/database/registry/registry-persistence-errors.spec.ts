import { DrizzleQueryError } from 'drizzle-orm/errors';
import { describe, expect, it } from 'vitest';
import {
    isForeignKeyViolation,
    isUniqueConstraintViolation,
} from './registry-persistence-errors.js';

function pgError(code: string): Error & { code: string } {
    return Object.assign(new Error('pg error'), { code });
}

describe('registry persistence errors', () => {
    it('detects violations raised directly by the pg driver', () => {
        expect(isUniqueConstraintViolation(pgError('23505'))).toBe(true);
        expect(isForeignKeyViolation(pgError('23503'))).toBe(true);
    });

    it('detects violations wrapped by DrizzleQueryError', () => {
        const unique = new DrizzleQueryError('insert', [], pgError('23505'));
        const foreignKey = new DrizzleQueryError(
            'delete',
            [],
            pgError('23503'),
        );

        expect(isUniqueConstraintViolation(unique)).toBe(true);
        expect(isForeignKeyViolation(foreignKey)).toBe(true);
    });

    it('ignores other errors', () => {
        const other = new DrizzleQueryError('select', [], pgError('42P01'));

        expect(isUniqueConstraintViolation(other)).toBe(false);
        expect(isForeignKeyViolation(other)).toBe(false);
        expect(isForeignKeyViolation(new Error('boom'))).toBe(false);
        expect(isForeignKeyViolation(undefined)).toBe(false);
    });
});
