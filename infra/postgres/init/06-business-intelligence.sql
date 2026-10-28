BEGIN;

CREATE SCHEMA IF NOT EXISTS business_intelligence;

CREATE TABLE IF NOT EXISTS business_intelligence.service_order_timeline (
    service_order_id VARCHAR(36) PRIMARY KEY,
    registered_at TIMESTAMPTZ,
    execution_started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS bi_sot_finished_at_idx
    ON business_intelligence.service_order_timeline(finished_at);

CREATE INDEX IF NOT EXISTS bi_sot_delivered_at_idx
    ON business_intelligence.service_order_timeline(delivered_at);

CREATE TABLE IF NOT EXISTS business_intelligence.restock_cycle (
    id VARCHAR(36) PRIMARY KEY,
    part_code VARCHAR(50) NOT NULL,
    opened_at TIMESTAMPTZ NOT NULL,
    closed_at TIMESTAMPTZ,
    quantity_at_open INTEGER NOT NULL,
    restocked_quantity INTEGER,
    CONSTRAINT bi_restock_cycle_dates_check CHECK (
        closed_at IS NULL OR closed_at >= opened_at
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS bi_restock_cycle_one_open_per_part
    ON business_intelligence.restock_cycle(part_code)
    WHERE closed_at IS NULL;

CREATE INDEX IF NOT EXISTS bi_restock_cycle_closed_at_idx
    ON business_intelligence.restock_cycle(part_code, closed_at);

COMMIT;
