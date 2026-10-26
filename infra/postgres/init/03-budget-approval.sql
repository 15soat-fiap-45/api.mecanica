BEGIN;
ALTER TABLE service_order.orders ADD COLUMN IF NOT EXISTS vehicle_id VARCHAR(36);
ALTER TABLE service_order.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE service_order.orders ADD CONSTRAINT orders_status_check
    CHECK (status IN ('PENDING', 'AWAITING_APPROVAL', 'APPROVED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED'));

CREATE TABLE IF NOT EXISTS service_order.approval_requests (
    id VARCHAR(36) PRIMARY KEY,
    order_id VARCHAR(36) NOT NULL REFERENCES service_order.orders(id) ON DELETE CASCADE,
    budget_id VARCHAR(36) NOT NULL REFERENCES service_order.budgets(id) ON DELETE CASCADE,
    budget_version VARCHAR(64) NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    decision VARCHAR(8) CHECK (decision IN ('approved', 'rejected')),
    rejection_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS approval_requests_active_order_idx
    ON service_order.approval_requests(order_id) WHERE used_at IS NULL AND revoked_at IS NULL;
COMMIT;
