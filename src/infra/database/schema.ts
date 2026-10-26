import {
    bigint,
    integer,
    numeric,
    pgEnum,
    pgTable,
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
});

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
