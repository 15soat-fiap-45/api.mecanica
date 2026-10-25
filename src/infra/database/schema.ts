import {
    bigint,
    numeric,
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
    telefone: numeric('telefone', { precision: 11, scale: 0 }),
    email: varchar('email', { length: 100 }),
});

export const veiculo = pgTable('veiculo', {
    veiculoId: varchar('veiculo_id', { length: 7 }).primaryKey(),
    modelo: varchar('modelo', { length: 30 }).notNull(),
    ano: numeric('ano', { precision: 4, scale: 0 }),
    marca: varchar('marca', { length: 16 }),
    cor: varchar('cor', { length: 15 }),
    clienteId: varchar('cliente_id', { length: 14 })
        .notNull()
        .references(() => cliente.clienteId),
});

export const servico = pgTable('servico', {
    servicoId: bigint('servico_id', { mode: 'number' }).primaryKey(),
    titulo: varchar('titulo', { length: 20 }).notNull(),
    descricao: varchar('descricao', { length: 200 }),
    valor: bigint('valor', { mode: 'number' }).notNull(),
});
