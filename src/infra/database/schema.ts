import {
    bigint,
    boolean,
    check,
    index,
    integer,
    pgSchema,
    pgTable,
    primaryKey,
    text,
    varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

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
        status: varchar('status', { length: 20 }).notNull().default('PENDING'),
        version: integer('version').notNull().default(0),
    },
    (table) => [
        check(
            'orders_status_check',
            sql`${table.status} IN ('PENDING', 'APPROVED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED')`,
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
