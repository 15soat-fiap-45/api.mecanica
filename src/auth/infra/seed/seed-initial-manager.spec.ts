import { drizzle } from 'drizzle-orm/node-postgres';
import type { PoolClient } from 'pg';
import { expect, it } from 'vitest';
import { seedInitialManager } from './seed-initial-manager.js';

it('creates only the pending initial manager with a hashed password and never resets it', async () => {
    const users = new Map<
        string,
        { password: string; role: string; status: string }
    >();
    const statements: string[] = [];
    const client = {
        query: async (config: { text: string }, params: unknown[] = []) => {
            statements.push(config.text.toLowerCase());
            if (!users.size) {
                users.set(params[0] as string, {
                    password: params[1] as string,
                    role: params[2] as string,
                    status: params[3] as string,
                });
            }
            return { rows: [], rowCount: 0 };
        },
    };
    const db = drizzle(client as unknown as PoolClient);
    const hasher = {
        hash: async (password: string) => `hashed:${password}`,
        verify: async () => false,
    };

    await seedInitialManager(db, hasher, 'ConfiguredPassword123');
    expect(users.get('admin@admin.com')).toEqual({
        password: 'hashed:ConfiguredPassword123',
        role: 'GERENTE',
        status: 'PENDING_FIRST_ACCESS',
    });
    users.set('admin@admin.com', {
        password: 'hashed:ChangedPassword123',
        role: 'GERENTE',
        status: 'ACTIVE',
    });
    await seedInitialManager(db, hasher, 'ConfiguredPassword123');
    expect(users.get('admin@admin.com')?.password).toBe(
        'hashed:ChangedPassword123',
    );
    users.clear();
    users.set('existing@example.com', {
        password: 'hashed:ExistingPassword123',
        role: 'GERENTE',
        status: 'ACTIVE',
    });
    await seedInitialManager(db, hasher, 'ConfiguredPassword123');
    expect(users.has('admin@admin.com')).toBe(false);
    expect(statements[0]).toContain('where not exists');
    expect(statements[0]).toContain('on conflict');
});
