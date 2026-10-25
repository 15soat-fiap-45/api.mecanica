import { and, count, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { FirstAccessNotAllowed } from '../../application/exceptions/first-access-not-allowed.js';
import { UserAlreadyExistsError } from '../../application/exceptions/user-already-exists.js';
import { LastActiveManager } from '../../domain/exceptions/last-active-manager.js';
import { User } from '../../domain/user/user.js';
import type { UserManagementRepository } from '../../domain/user/user-repository.js';
import { Role } from '../../domain/user/value-objects/role.js';
import { Email } from '../../../shared/domain/email.js';
import { authUsers } from '../../../infra/database/schema.js';

export class DrizzleUserRepository implements UserManagementRepository {
    constructor(private readonly db: NodePgDatabase) {}

    async findByEmail(email: Email): Promise<User | null> {
        const [row] = await this.db
            .select()
            .from(authUsers)
            .where(eq(authUsers.email, email.value))
            .limit(1);
        return row ? this.toUser(row) : null;
    }

    async save(user: User): Promise<void> {
        if (user.status === 'PENDING_FIRST_ACCESS') {
            const inserted = await this.db
                .insert(authUsers)
                .values({
                    id: user.id.value,
                    email: user.email.value,
                    passwordHash: user.password,
                    role: user.role.value,
                    status: user.status,
                })
                .onConflictDoNothing()
                .returning({ email: authUsers.email });
            if (!inserted.length) throw new UserAlreadyExistsError();
            return;
        }

        if (user.status !== 'ACTIVE') throw new FirstAccessNotAllowed();
        const activated = await this.db
            .update(authUsers)
            .set({ passwordHash: user.password, status: 'ACTIVE' })
            .where(
                and(
                    eq(authUsers.email, user.email.value),
                    eq(authUsers.status, 'PENDING_FIRST_ACCESS'),
                ),
            )
            .returning({ email: authUsers.email });
        if (!activated.length) throw new FirstAccessNotAllowed();
    }

    async changeRoleAtomically(email: Email, role: Role): Promise<User | null> {
        return this.db.transaction(async (tx) => {
            await tx.execute(sql`SELECT pg_advisory_xact_lock(8425001)`);
            const [current] = await tx
                .select()
                .from(authUsers)
                .where(eq(authUsers.email, email.value))
                .for('update');
            if (!current) return null;
            if (
                current.status === 'ACTIVE' &&
                current.role === 'GERENTE' &&
                role.value !== 'GERENTE'
            ) {
                const [managers] = await tx
                    .select({ total: count() })
                    .from(authUsers)
                    .where(
                        and(
                            eq(authUsers.role, 'GERENTE'),
                            eq(authUsers.status, 'ACTIVE'),
                        ),
                    );
                if (!managers || managers.total <= 1) {
                    throw new LastActiveManager();
                }
            }
            const [changed] = await tx
                .update(authUsers)
                .set({ role: role.value })
                .where(eq(authUsers.email, email.value))
                .returning();
            return this.toUser(changed!);
        });
    }

    async deactivateAtomically(email: Email): Promise<User | null> {
        return this.db.transaction(async (tx) => {
            await tx.execute(sql`SELECT pg_advisory_xact_lock(8425001)`);
            const [current] = await tx
                .select()
                .from(authUsers)
                .where(eq(authUsers.email, email.value))
                .for('update');
            if (!current) return null;
            if (current.status === 'ACTIVE' && current.role === 'GERENTE') {
                const [managers] = await tx
                    .select({ total: count() })
                    .from(authUsers)
                    .where(
                        and(
                            eq(authUsers.role, 'GERENTE'),
                            eq(authUsers.status, 'ACTIVE'),
                        ),
                    );
                if (!managers || managers.total <= 1) {
                    throw new LastActiveManager();
                }
            }
            const [deactivated] = await tx
                .update(authUsers)
                .set({ status: 'DEACTIVATED' })
                .where(eq(authUsers.email, email.value))
                .returning();
            return this.toUser(deactivated!);
        });
    }

    private toUser(row: typeof authUsers.$inferSelect): User {
        return new User(
            Email.create(row.email),
            row.passwordHash,
            Role.create(row.role),
            row.status,
            row.id,
        );
    }
}
