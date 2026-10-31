import {
    bigint,
    boolean,
    check,
    index,
    integer,
    numeric,
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

export const tipoServico = pgTable('tipo_servico', {
    id: varchar('id', { length: 36 }).primaryKey(),
    nome: varchar('nome', { length: 50 }).notNull().unique(),
});

export const servico = pgTable(
    'servico',
    {
        id: varchar('id', { length: 36 }).primaryKey(),
        nome: varchar('nome', { length: 100 }).notNull(),
        descricao: varchar('descricao', { length: 500 }),
        // Valor em centavos.
        valor: bigint('valor', { mode: 'number' }).notNull(),
        tipoServicoId: varchar('tipo_servico_id', { length: 36 })
            .notNull()
            .references(() => tipoServico.id),
    },
    (table) => [
        index('servico_tipo_servico_id_idx').on(table.tipoServicoId),
        check('servico_valor_check', sql`${table.valor} >= 0`),
    ],
);

export const stockUnitOfMeasure = pgEnum('stock_unit_of_measure', [
    'UNIT',
    'PAIR',
    'SET',
    'LITER',
    'KILOGRAM',
    'METER',
]);

export const stockReservationStatus = pgEnum('stock_reservation_status', [
    'PENDING',
    'CONFIRMED',
    'CANCELLED',
    'CONSUMED',
]);

export const pecaInsumo = pgTable('peca_insumo', {
    itemId: bigint('item_id', { mode: 'number' })
        .generatedByDefaultAsIdentity()
        .primaryKey(),
    stockId: uuid('stock_id').notNull().defaultRandom().unique(),
    nome: varchar('nome', { length: 20 }).notNull(),
    descricao: varchar('descricao', { length: 200 }),
    valor: bigint('valor', { mode: 'number' }).notNull().default(0),
    // Exclusão lógica: a peça mantém histórico de movimentações e reservas.
    ativo: boolean('ativo').notNull().default(true),
    partCode: varchar('part_code', { length: 50 }).notNull().unique(),
    unitOfMeasure: stockUnitOfMeasure('unit_of_measure')
        .notNull()
        .default('UNIT'),
    version: integer('version').notNull().default(0),
});

export const estoque = pgTable('estoque', {
    estoqueId: bigint('estoque_id', { mode: 'number' })
        .generatedByDefaultAsIdentity()
        .primaryKey(),
    itemId: bigint('item_id', { mode: 'number' })
        .notNull()
        .unique()
        .references(() => pecaInsumo.itemId),
    quantidadeDisponivel: numeric('quantidade_disponivel', {
        precision: 10,
        scale: 2,
    }).notNull().default('0'),
    quantidadeMinima: numeric('quantidade_minima', {
        precision: 10,
        scale: 2,
    }).notNull().default('0'),
});

export const movimentoEstoque = pgTable('movimento_estoque', {
    movimentoId: bigint('movimento_id', { mode: 'number' })
        .generatedByDefaultAsIdentity()
        .primaryKey(),
    itemId: bigint('item_id', { mode: 'number' })
        .notNull()
        .references(() => pecaInsumo.itemId),
    tipo: varchar('tipo', { length: 20 }).notNull(),
    quantidade: numeric('quantidade', {
        precision: 10,
        scale: 2,
    }).notNull(),
    dataHora: timestamp('data_hora').notNull().defaultNow(),
    usuarioId: bigint('usuario_id', { mode: 'number' }),
    osId: bigint('os_id', { mode: 'number' }),
    observacao: text('observacao'),
}, (table) => [
    index('movimento_estoque_item_data_idx').on(
        table.itemId,
        table.dataHora,
    ),
    check(
        'movimento_estoque_tipo_check',
        sql`${table.tipo} IN ('ENTRADA', 'SAIDA', 'AJUSTE')`,
    ),
    check(
        'movimento_estoque_quantidade_check',
        sql`${table.quantidade} > 0`,
    ),
]);

export const reservaEstoque = pgTable(
    'reserva_estoque',
    {
        id: uuid('reserva_id').primaryKey().defaultRandom(),
        itemId: bigint('item_id', { mode: 'number' })
            .notNull()
            .references(() => pecaInsumo.itemId),
        serviceOrderId: varchar('service_order_id', { length: 100 }).notNull(),
        quantity: integer('quantidade').notNull(),
        status: stockReservationStatus('status').notNull().default('PENDING'),
        version: integer('version').notNull().default(0),
        createdAt: timestamp('criado_em')
            .notNull()
            .defaultNow(),
    },
    (table) => ({
        openReservationKey: uniqueIndex(
            'reserva_estoque_open_order_item_key',
        )
            .on(table.serviceOrderId, table.itemId)
            .where(
                sql`${table.status} in ('PENDING', 'CONFIRMED')`,
            ),
    }),
);

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
        description: varchar('description', { length: 200 }),
        unitPriceCents: bigint('unit_price_cents', { mode: 'number' })
            .notNull()
            .default(0),
    },
    (table) => [
        primaryKey({ columns: [table.serviceOrderId, table.partCode] }),
        check('supply_items_quantity_check', sql`${table.quantity} > 0`),
        check(
            'supply_items_unit_price_cents_check',
            sql`${table.unitPriceCents} >= 0`,
        ),
    ],
);

// Catalog services included in the order. Name and price are copied from
// public.servico at inclusion time, so there is no foreign key to it.
export const serviceOrderServices = serviceOrderSchema.table(
    'order_services',
    {
        serviceOrderId: varchar('service_order_id', { length: 36 })
            .notNull()
            .references(() => serviceOrders.id, { onDelete: 'cascade' }),
        serviceId: varchar('service_id', { length: 36 }).notNull(),
        name: varchar('name', { length: 100 }).notNull(),
        priceCents: bigint('price_cents', { mode: 'number' }).notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.serviceOrderId, table.serviceId] }),
        check(
            'order_services_price_cents_check',
            sql`${table.priceCents} >= 0`,
        ),
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

// Business Intelligence projections (context-owned read models; no foreign keys to other contexts)
export const businessIntelligenceSchema = pgSchema('business_intelligence');

export const biServiceOrderTimelines = businessIntelligenceSchema.table(
    'service_order_timeline',
    {
        serviceOrderId: varchar('service_order_id', {
            length: 36,
        }).primaryKey(),
        registeredAt: timestamp('registered_at', { withTimezone: true }),
        executionStartedAt: timestamp('execution_started_at', {
            withTimezone: true,
        }),
        finishedAt: timestamp('finished_at', { withTimezone: true }),
        deliveredAt: timestamp('delivered_at', { withTimezone: true }),
        cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        index('bi_sot_finished_at_idx').on(table.finishedAt),
        index('bi_sot_delivered_at_idx').on(table.deliveredAt),
    ],
);

export const biRestockCycles = businessIntelligenceSchema.table(
    'restock_cycle',
    {
        id: varchar('id', { length: 36 }).primaryKey(),
        partCode: varchar('part_code', { length: 50 }).notNull(),
        openedAt: timestamp('opened_at', { withTimezone: true }).notNull(),
        closedAt: timestamp('closed_at', { withTimezone: true }),
        quantityAtOpen: integer('quantity_at_open').notNull(),
        restockedQuantity: integer('restocked_quantity'),
    },
    (table) => [
        uniqueIndex('bi_restock_cycle_one_open_per_part')
            .on(table.partCode)
            .where(sql`${table.closedAt} IS NULL`),
        index('bi_restock_cycle_closed_at_idx').on(
            table.partCode,
            table.closedAt,
        ),
        check(
            'bi_restock_cycle_dates_check',
            sql`${table.closedAt} IS NULL OR ${table.closedAt} >= ${table.openedAt}`,
        ),
    ],
);
