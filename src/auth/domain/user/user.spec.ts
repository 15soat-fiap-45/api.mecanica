import { describe, expect, it } from 'vitest';
import { Email } from '../../../shared/domain/email.js';
import { PermissionDenied } from '../exceptions/permission-denied.js';
import { User } from './user.js';
import { UserId } from './user-id.js';
import { Role } from './value-objects/role.js';

describe('User', () => {
    const user = (
        role: string,
        status: 'ACTIVE' | 'PENDING_FIRST_ACCESS' | 'DEACTIVATED' = 'ACTIVE',
    ) =>
        new User(
            Email.create('person@example.com'),
            'stored-hash',
            Role.create(role),
            status,
        );

    it('activates only pending users with a replacement hash', () => {
        const pending = user('MECANICO', 'PENDING_FIRST_ACCESS');
        const activated = pending.activateWithPassword('new-stored-hash');
        expect(activated.password).toBe('new-stored-hash');
        expect(activated.status).toBe('ACTIVE');
        expect(activated.id.equals(pending.id)).toBe(true);
        expect(pending.status).toBe('PENDING_FIRST_ACCESS');
        expect(() => activated.activateWithPassword('another-hash')).toThrow(
            PermissionDenied,
        );
        expect(() =>
            user('GERENTE', 'DEACTIVATED').activateWithPassword('another-hash'),
        ).toThrow(PermissionDenied);
    });

    it('has a UUIDv4 identity independent of email and restores an existing identity', () => {
        const first = user('GERENTE');
        const second = user('GERENTE');
        expect(first.id).toBeInstanceOf(UserId);
        expect(first.id.value).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
        expect(first.id.equals(second.id)).toBe(false);
        expect(
            new User(
                first.email,
                first.password,
                first.role,
                first.status,
                first.id,
            ).id.equals(first.id),
        ).toBe(true);
    });
});
