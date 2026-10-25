import { getTableName } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { authUsers } from '../../../infra/database/schema.js';
import { firstAccessBody, loginBody, registerBody } from './auth-schema.js';

it('stores user identity, password hash, role, and status', () => {
    expect(getTableName(authUsers)).toBe('auth_users');
    expect(authUsers.id.primary).toBe(true);
    expect(authUsers.id.hasDefault).toBe(true);
    expect(authUsers.email.isUnique).toBe(true);
    expect(authUsers.email.notNull).toBe(true);
    expect(authUsers.passwordHash.notNull).toBe(true);
    expect(authUsers.role.notNull).toBe(true);
    expect(authUsers.status.notNull).toBe(true);
});

it('validates required string fields for auth requests', () => {
    expect(
        firstAccessBody.safeParse({
            email: 'admin@admin.com',
            temporaryPassword: 'admin',
            newPassword: 'NewPass123',
        }).success,
    ).toBe(true);
    expect(
        firstAccessBody.safeParse({
            email: 'admin@admin.com',
            temporaryPassword: 'admin',
        }).success,
    ).toBe(false);
    expect(
        loginBody.safeParse({ email: 'admin@admin.com', password: 123 })
            .success,
    ).toBe(false);
    expect(
        registerBody.safeParse({ email: 'new@example.com', role: 5 }).success,
    ).toBe(false);
});
