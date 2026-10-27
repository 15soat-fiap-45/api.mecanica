import { drizzle } from 'drizzle-orm/node-postgres';
import type { PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';
import { FirstAccessNotAllowed } from '../../application/exceptions/first-access-not-allowed.js';
import { UserAlreadyExistsError } from '../../application/exceptions/user-already-exists.js';
import { LastActiveManager } from '../../domain/exceptions/last-active-manager.js';
import { User } from '../../domain/user/user.js';
import { UserId } from '../../domain/user/user-id.js';
import { Role } from '../../domain/user/value-objects/role.js';
import { Email } from '../../../shared/domain/email.js';
import { DrizzleUserRepository } from './drizzle-user-repository.js';

type Row = {
    id: string;
    email: string;
    passwordHash: string;
    role: 'GERENTE' | 'ATENDENTE';
    status: 'ACTIVE' | 'PENDING_FIRST_ACCESS' | 'DEACTIVATED';
};

function testDatabase() {
    const users = new Map<string, Row>();
    const statements: string[] = [];
    const client = {
        query: async (config: { text: string }, params: unknown[] = []) => {
            const text = config.text.toLowerCase();
            statements.push(text);
            const response = (rows: unknown[][]) => ({
                rows,
                rowCount: rows.length,
            });
            if (
                /^(begin|commit|rollback)/.test(text) ||
                text.includes('pg_advisory_xact_lock')
            ) {
                return response([]);
            }
            if (text.startsWith('select') && text.includes('count(')) {
                return response([
                    [
                        [...users.values()].filter(
                            (user) =>
                                user.status === 'ACTIVE' &&
                                user.role === 'GERENTE',
                        ).length,
                    ],
                ]);
            }
            if (text.startsWith('select')) {
                const row = users.get(params[0] as string);
                return response(
                    row
                        ? [
                              [
                                  row.id,
                                  row.email,
                                  row.passwordHash,
                                  row.role,
                                  row.status,
                              ],
                          ]
                        : [],
                );
            }
            if (text.startsWith('insert')) {
                const [id, email, passwordHash, role, status] = params as [
                    string,
                    string,
                    string,
                    Row['role'],
                    Row['status'],
                ];
                if (users.has(email)) return response([]);
                users.set(email, { id, email, passwordHash, role, status });
                return response([[email]]);
            }
            if (text.startsWith('update')) {
                if (text.includes('set "password_hash"')) {
                    const [passwordHash, status, email] = params as [
                        string,
                        Row['status'],
                        string,
                    ];
                    const row = users.get(email);
                    if (!row || row.status !== 'PENDING_FIRST_ACCESS')
                        return response([]);
                    row.passwordHash = passwordHash;
                    row.status = status;
                    return response([[row.email]]);
                }
                const [value, email] = params as [string, string];
                const row = users.get(email);
                if (!row) return response([]);
                if (text.includes('set "role"'))
                    row.role = value as Row['role'];
                else row.status = value as Row['status'];
                return response([
                    [row.id, row.email, row.passwordHash, row.role, row.status],
                ]);
            }
            throw new Error(`Unexpected SQL: ${config.text}`);
        },
    };
    return {
        users,
        statements,
        repository: new DrizzleUserRepository(
            drizzle(client as unknown as PoolClient),
        ),
    };
}

const user = (
    email: string,
    role: 'GERENTE' | 'ATENDENTE',
    status: Row['status'] = 'ACTIVE',
) => new User(Email.create(email), 'stored-hash', Role.create(role), status);

describe('DrizzleUserRepository', () => {
    it('inserts a pending user, reads the hash, and rejects duplicate email', async () => {
        const { repository } = testDatabase();
        const pending = user(
            'new@example.com',
            'ATENDENTE',
            'PENDING_FIRST_ACCESS',
        );
        await repository.save(pending);
        expect((await repository.findByEmail(pending.email))?.password).toBe(
            'stored-hash',
        );
        expect(
            (await repository.findByEmail(pending.email))?.id.equals(
                pending.id,
            ),
        ).toBe(true);
        await expect(repository.save(pending)).rejects.toThrow(
            UserAlreadyExistsError,
        );
    });

    it('activates only a pending user and keeps the stored role unchanged', async () => {
        const { repository, users } = testDatabase();
        const pending = user(
            'new@example.com',
            'ATENDENTE',
            'PENDING_FIRST_ACCESS',
        );
        await repository.save(pending);
        const activated = pending.activateWithPassword('new-hash');
        await repository.save(activated);
        expect(users.get('new@example.com')).toEqual({
            id: pending.id.value,
            email: 'new@example.com',
            passwordHash: 'new-hash',
            role: 'ATENDENTE',
            status: 'ACTIVE',
        });
        await expect(repository.save(activated)).rejects.toThrow(
            FirstAccessNotAllowed,
        );
        expect(activated.id.equals(pending.id)).toBe(true);
    });

    it.each(['changeRoleAtomically', 'deactivateAtomically'] as const)(
        'rejects %s when it would remove the last active manager',
        async (operation) => {
            const { repository, users, statements } = testDatabase();
            users.set('manager@example.com', {
                id: new UserId().value,
                email: 'manager@example.com',
                passwordHash: 'stored-hash',
                role: 'GERENTE',
                status: 'ACTIVE',
            });
            const email = Email.create('manager@example.com');
            await expect(
                operation === 'changeRoleAtomically'
                    ? repository.changeRoleAtomically(
                          email,
                          Role.create('ATENDENTE'),
                      )
                    : repository.deactivateAtomically(email),
            ).rejects.toThrow(LastActiveManager);
            expect(users.get(email.value)?.role).toBe('GERENTE');
            expect(users.get(email.value)?.status).toBe('ACTIVE');
            expect(
                statements.findIndex((query) =>
                    query.includes('pg_advisory_xact_lock'),
                ),
            ).toBeLessThan(
                statements.findIndex((query) => query.includes('count(')),
            );
            expect(statements).toContain('rollback');
        },
    );

    it('allows one manager to be demoted and another to be deactivated with a manager remaining', async () => {
        const { repository, users } = testDatabase();
        for (const email of [
            'first@example.com',
            'second@example.com',
            'third@example.com',
        ]) {
            users.set(email, {
                id: new UserId().value,
                email,
                passwordHash: 'stored-hash',
                role: 'GERENTE',
                status: 'ACTIVE',
            });
        }
        const demoted = await repository.changeRoleAtomically(
            Email.create('first@example.com'),
            Role.create('ATENDENTE'),
        );
        const deactivated = await repository.deactivateAtomically(
            Email.create('second@example.com'),
        );
        expect(demoted?.role.value).toBe('ATENDENTE');
        expect(demoted?.id.value).toBe(users.get('first@example.com')?.id);
        expect(deactivated?.status).toBe('DEACTIVATED');
        expect(deactivated?.id.value).toBe(users.get('second@example.com')?.id);
        expect(users.get('third@example.com')?.status).toBe('ACTIVE');
    });

    it('returns null for missing management targets', async () => {
        const { repository } = testDatabase();
        expect(
            await repository.changeRoleAtomically(
                Email.create('missing@example.com'),
                Role.create('GERENTE'),
            ),
        ).toBeNull();
        expect(
            await repository.deactivateAtomically(
                Email.create('missing@example.com'),
            ),
        ).toBeNull();
    });
});
