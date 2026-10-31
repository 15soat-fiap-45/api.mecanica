-- Catálogo de serviços (tipo de serviço + serviço) e serviços/preços na OS.
-- Assim como 0002 e 0003, depende das tabelas criadas pelos scripts de
-- infra/postgres/init (service_order.orders e service_order.supply_items).
-- Os comandos são idempotentes.
CREATE TABLE IF NOT EXISTS "tipo_servico" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"nome" varchar(50) NOT NULL,
	CONSTRAINT "tipo_servico_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "servico" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"nome" varchar(100) NOT NULL,
	"descricao" varchar(500),
	"valor" bigint NOT NULL,
	"tipo_servico_id" varchar(36) NOT NULL,
	CONSTRAINT "servico_tipo_servico_id_tipo_servico_id_fk" FOREIGN KEY ("tipo_servico_id") REFERENCES "public"."tipo_servico"("id") ON DELETE no action ON UPDATE no action,
	CONSTRAINT "servico_valor_check" CHECK ("servico"."valor" >= 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "servico_tipo_servico_id_idx" ON "servico" USING btree ("tipo_servico_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_order"."order_services" (
	"service_order_id" varchar(36) NOT NULL,
	"service_id" varchar(36) NOT NULL,
	"name" varchar(100) NOT NULL,
	"price_cents" bigint NOT NULL,
	CONSTRAINT "order_services_service_order_id_service_id_pk" PRIMARY KEY("service_order_id","service_id"),
	CONSTRAINT "order_services_service_order_id_orders_id_fk" FOREIGN KEY ("service_order_id") REFERENCES "service_order"."orders"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "order_services_price_cents_check" CHECK ("service_order"."order_services"."price_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "service_order"."supply_items" ADD COLUMN IF NOT EXISTS "description" varchar(200);
--> statement-breakpoint
ALTER TABLE "service_order"."supply_items" ADD COLUMN IF NOT EXISTS "unit_price_cents" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "service_order"."supply_items" DROP CONSTRAINT IF EXISTS "supply_items_unit_price_cents_check";
--> statement-breakpoint
ALTER TABLE "service_order"."supply_items" ADD CONSTRAINT "supply_items_unit_price_cents_check" CHECK ("service_order"."supply_items"."unit_price_cents" >= 0);
--> statement-breakpoint
-- A OS deixa de ter valor próprio: o orçamento soma serviços e peças.
-- O valor orçado de cada fase continua em order_status_history.value_cents.
ALTER TABLE "service_order"."orders" DROP CONSTRAINT IF EXISTS "orders_value_cents_check";
--> statement-breakpoint
ALTER TABLE "service_order"."orders" DROP COLUMN IF EXISTS "value_cents";
