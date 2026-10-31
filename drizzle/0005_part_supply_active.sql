-- Exclusão lógica de peças/insumos: a peça mantém o histórico de
-- movimentações e reservas, mas deixa de aparecer no catálogo e não pode
-- mais ser incluída em ordens de serviço.
ALTER TABLE "peca_insumo" ADD COLUMN IF NOT EXISTS "ativo" boolean DEFAULT true NOT NULL;
