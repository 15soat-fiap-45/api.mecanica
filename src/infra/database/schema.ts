import {
    bigint,
    boolean,
    check,
    index,
    integer,
    pgEnum,
    pgSchema,
    pgTable,
    primaryKey,
    text,
    timestamp,
    uniqueIndex,
    uuid,
    varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { USER_STATUSES } from '../../auth/domain/user/user.js';
import { ROLES } from '../../auth/domain/user/value-objects/role.js';

export const authRole = pgEnum('auth_role', [...ROLES]);
export const authStatus = pgEnum('auth_user_status', [...USER_STATUSES]);

export const authUsers = pgTable('auth_users', {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 320 }).notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    role: authRole('role').notNull(),
    status: authStatus('status').notNull(),
});

export const cliente = pgTable('cliente', {
    clienteId: varchar('cliente_id', { length: 14 }).primaryKey(),
    nome: varchar('nome', { length: 100 }).notNull(),
    telefone: varchar('telefone', { length: 11 }).notNull(),
    email: varchar('email', { length: 100 }).notNull(),
    version: integer('version').notNull().default(0),
});

export const veiculo = pgTable('veiculo', {
    veiculoId: varchar('veiculo_id', { length: 36 }).primaryKey(),
    placa: varchar('placa', { length: 7 }).notNull().unique(),
    modelo: varchar('modelo', { length: 30 }).notNull(),
    ano: integer('ano').notNull(),
    marca: varchar('marca', { length: 16 }).notNull(),
    cor: varchar('cor', { length: 15 }).notNull(),
    version: integer('version').notNull().default(0),
    clienteId: varchar('cliente_id', { length: 14 })
        .notNull()
        .references(() => cliente.clienteId),
});

export const servico = pgTable('servico', {
    servicoId: bigint('servico_id', { mode: 'number' })
        .generatedByDefaultAsIdentity()
        .primaryKey(),
    titulo: varchar('titulo', { length: 20 }).notNull(),
    descricao: varchar('descricao', { length: 200 }),
    valor: bigint('valor', { mode: 'number' }).notNull(),
});

// Context-owned tables; the legacy public schema uses a different OS model.
export const serviceOrderSchema = pgSchema('service_order');

export const serviceOrders = serviceOrderSchema.table(
    'orders',
    {
        id: varchar('id', { length: 36 }).primaryKey(),
        description: text('description').notNull(),
        vehicleId: varchar('vehicle_id', { length: 36 }),
        status: varchar('status', { length: 20 }).notNull().default('PENDING'),
        version: integer('version').notNull().default(0),
    },
    (table) => [
        check(
            'orders_status_check',
            sql`${table.status} IN ('PENDING', 'AWAITING_APPROVAL', 'REJECTED', 'APPROVED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'DELIVERED', 'CANCELLED')`,
        ),
    ],
);

export const serviceOrderSupplies = serviceOrderSchema.table(
    'supply_items',
    {
        serviceOrderId: varchar('service_order_id', { length: 36 })
            .notNull()
            .references(() => serviceOrders.id, { onDelete: 'cascade' }),
        partCode: varchar('part_code', { length: 50 }).notNull(),
        quantity: integer('quantity').notNull(),
        used: boolean('used').notNull().default(false),
    },
    (table) => [
        primaryKey({ columns: [table.serviceOrderId, table.partCode] }),
        check('supply_items_quantity_check', sql`${table.quantity} > 0`),
    ],
);

export const budgets = serviceOrderSchema.table(
    'budgets',
    {
        id: varchar('id', { length: 36 }).primaryKey(),
        serviceOrderId: varchar('service_order_id', { length: 36 })
            .notNull()
            .references(() => serviceOrders.id, { onDelete: 'cascade' }),
        totalCents: bigint('total_cents', { mode: 'number' }).notNull(),
        status: varchar('status', { length: 20 }).notNull().default('PENDING'),
        version: integer('version').notNull().default(0),
    },
    (table) => [
        index('budgets_service_order_id_idx').on(table.serviceOrderId),
        check('budgets_total_cents_check', sql`${table.totalCents} >= 0`),
        check(
            'budgets_status_check',
            sql`${table.status} IN ('PENDING', 'APPROVED', 'REJECTED')`,
        ),
    ],
);

export const approvalRequests = serviceOrderSchema.table(
    'approval_requests',
    {
        id: varchar('id', { length: 36 }).primaryKey(),
        orderId: varchar('order_id', { length: 36 })
            .notNull()
            .references(() => serviceOrders.id, { onDelete: 'cascade' }),
        budgetId: varchar('budget_id', { length: 36 })
            .notNull()
            .references(() => budgets.id, { onDelete: 'cascade' }),
        budgetVersion: varchar('budget_version', { length: 64 }).notNull(),
        tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        usedAt: timestamp('used_at', { withTimezone: true }),
        revokedAt: timestamp('revoked_at', { withTimezone: true }),
        sentAt: timestamp('sent_at', { withTimezone: true }),
        decision: varchar('decision', { length: 8 }),
        rejectionReason: text('rejection_reason'),
    },
    (table) => [
        uniqueIndex('approval_requests_active_order_idx')
            .on(table.orderId)
            .where(sql`${table.usedAt} IS NULL AND ${table.revokedAt} IS NULL`),
        check(
            'approval_decision_check',
            sql`${table.decision} IS NULL OR ${table.decision} IN ('approved', 'rejected')`,
        ),
    ],
);

export const catalogServices = serviceOrderSchema.table(
    'services',
    {
        id: bigint('id', { mode: 'number' })
            .generatedByDefaultAsIdentity()
            .primaryKey(),
        title: varchar('title', { length: 20 }).notNull(),
        description: varchar('description', { length: 200 }),
        valueCents: bigint('value_cents', { mode: 'number' }).notNull(),
    },
    (table) => [
        check('services_value_cents_check', sql`${table.valueCents} >= 0`),
    ],
);

export const serviceParts = serviceOrderSchema.table(
    'service_parts',
    {
        serviceId: bigint('service_id', { mode: 'number' })
            .notNull()
            .references(() => catalogServices.id),
        partId: bigint('part_id', { mode: 'number' }).notNull(),
    },
    (table) => [primaryKey({ columns: [table.serviceId, table.partId] })],
);

export const orderServices = serviceOrderSchema.table(
    'order_services',
    {
        orderId: varchar('order_id', { length: 36 })
            .notNull()
            .references(() => serviceOrders.id, { onDelete: 'cascade' }),
        serviceId: bigint('service_id', { mode: 'number' })
            .notNull()
            .references(() => catalogServices.id),
        title: varchar('title', { length: 20 }).notNull(),
        valueCents: bigint('value_cents', { mode: 'number' }).notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.orderId, table.serviceId] }),
        check(
            'order_services_value_cents_check',
            sql`${table.valueCents} >= 0`,
        ),
    ],
);

export const orderStatusHistory = serviceOrderSchema.table(
    'order_status_history',
    {
        id: bigint('id', { mode: 'number' })
            .generatedByDefaultAsIdentity()
            .primaryKey(),
        orderId: varchar('order_id', { length: 36 })
            .notNull()
            .references(() => serviceOrders.id, { onDelete: 'cascade' }),
        status: varchar('status', { length: 20 }).notNull(),
        valueCents: bigint('value_cents', { mode: 'number' }),
        changedBy: varchar('changed_by', { length: 320 }),
        recordedAt: timestamp('recorded_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        index('order_status_history_order_id_idx').on(table.orderId, table.id),
        check(
            'order_status_history_status_check',
            sql`${table.status} IN ('PENDING', 'AWAITING_APPROVAL', 'REJECTED', 'APPROVED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'DELIVERED', 'CANCELLED')`,
        ),
        check(
            'order_status_history_value_cents_check',
            sql`${table.valueCents} IS NULL OR ${table.valueCents} >= 0`,
        ),
    ],
);
