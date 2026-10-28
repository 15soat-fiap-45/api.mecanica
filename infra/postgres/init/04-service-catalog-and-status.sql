BEGIN;
ALTER TABLE service_order.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE service_order.orders ADD CONSTRAINT orders_status_check
    CHECK (status IN ('PENDING', 'AWAITING_APPROVAL', 'REJECTED', 'APPROVED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'DELIVERED', 'CANCELLED'));

ALTER TABLE service_order.orders ADD COLUMN IF NOT EXISTS value_cents BIGINT;
ALTER TABLE service_order.orders DROP CONSTRAINT IF EXISTS orders_value_cents_check;
ALTER TABLE service_order.orders ADD CONSTRAINT orders_value_cents_check
    CHECK (value_cents IS NULL OR value_cents >= 0);

DROP TABLE IF EXISTS service_order.order_services;
DROP TABLE IF EXISTS service_order.service_parts;
DROP TABLE IF EXISTS service_order.services;
COMMIT;
