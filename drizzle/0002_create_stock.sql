CREATE TYPE "public"."stock_unit_of_measure" AS ENUM('UNIT', 'PAIR', 'SET', 'LITER', 'KILOGRAM', 'METER');--> statement-breakpoint
CREATE TYPE "public"."stock_reservation_status" AS ENUM('PENDING', 'CONFIRMED', 'CANCELLED', 'CONSUMED');--> statement-breakpoint
ALTER TABLE "peca_insumo" ADD COLUMN "stock_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "peca_insumo" ADD COLUMN "part_code" varchar(50);--> statement-breakpoint
ALTER TABLE "peca_insumo" ADD COLUMN "unit_of_measure" "stock_unit_of_measure" DEFAULT 'UNIT' NOT NULL;--> statement-breakpoint
ALTER TABLE "peca_insumo" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "peca_insumo" SET "part_code" = 'ITEM-' || "item_id" WHERE "part_code" IS NULL;--> statement-breakpoint
ALTER TABLE "peca_insumo" ALTER COLUMN "part_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "peca_insumo" ADD CONSTRAINT "peca_insumo_stock_id_unique" UNIQUE("stock_id");--> statement-breakpoint
ALTER TABLE "peca_insumo" ADD CONSTRAINT "peca_insumo_part_code_unique" UNIQUE("part_code");--> statement-breakpoint
CREATE TABLE "reserva_estoque" (
	"reserva_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" bigint NOT NULL,
	"service_order_id" varchar(100) NOT NULL,
	"quantidade" integer NOT NULL,
	"status" "stock_reservation_status" DEFAULT 'PENDING' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "reserva_estoque" ADD CONSTRAINT "reserva_estoque_item_id_peca_insumo_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."peca_insumo"("item_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reserva_estoque_open_order_item_key" ON "reserva_estoque" USING btree ("service_order_id","item_id") WHERE "reserva_estoque"."status" in ('PENDING', 'CONFIRMED');
