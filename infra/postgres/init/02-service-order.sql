-- Persistence for the current Service Order bounded context.
-- Kept separate from the legacy public.ordem_servico/orcamento model.
-- Safe to apply to an existing database without deleting legacy data.
BEGIN;

CREATE SCHEMA IF NOT EXISTS service_order;

CREATE TABLE IF NOT EXISTS service_order.orders (
    id VARCHAR(36) PRIMARY KEY,
    description TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    version INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT orders_status_check CHECK (
        status IN ('PENDING', 'APPROVED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED')
    )
);

CREATE TABLE IF NOT EXISTS service_order.supply_items (
    service_order_id VARCHAR(36) NOT NULL REFERENCES service_order.orders(id) ON DELETE CASCADE,
    part_code VARCHAR(50) NOT NULL,
    quantity INTEGER NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (service_order_id, part_code),
    CONSTRAINT supply_items_quantity_check CHECK (quantity > 0)
);

CREATE TABLE IF NOT EXISTS service_order.budgets (
    id VARCHAR(36) PRIMARY KEY,
    service_order_id VARCHAR(36) NOT NULL REFERENCES service_order.orders(id) ON DELETE CASCADE,
    total_cents BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    version INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT budgets_total_cents_check CHECK (total_cents >= 0),
    CONSTRAINT budgets_status_check CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'))
);

CREATE INDEX IF NOT EXISTS budgets_service_order_id_idx ON service_order.budgets(service_order_id);

COMMIT;
