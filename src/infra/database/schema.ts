import {
    bigint,
    integer,
    pgEnum,
    pgTable,
    text,
    uuid,
    varchar,
} from 'drizzle-orm/pg-core';
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
