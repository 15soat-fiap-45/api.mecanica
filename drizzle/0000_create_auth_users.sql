CREATE TYPE "public"."auth_role" AS ENUM('ATENDENTE', 'MECANICO', 'ESTOQUISTA', 'GERENTE');--> statement-breakpoint
CREATE TYPE "public"."auth_user_status" AS ENUM('PENDING_FIRST_ACCESS', 'ACTIVE', 'DEACTIVATED');--> statement-breakpoint
CREATE TABLE "auth_users" (
	"email" varchar(320) PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"role" "auth_role" NOT NULL,
	"status" "auth_user_status" NOT NULL
);