-- =========================================================
-- Script PostgreSQL - Modelo Relacional para Oficina Mecânica
-- =========================================================
-- Tabelas principais:
--   CLIENTE, VEICULO, SERVICO, PECA_INSUMO, MARCA_PECA_INSUMO,
--   CATEGORIA_PECA, USUARIO, ORDEM_SERVICO, SERVICOS_OS,
--   INSUMOS_OS, ORCAMENTO, ESTOQUE, MOVIMENTO_ESTOQUE,
--   OS_STATUS_HISTORICO
-- =========================================================

-- ---------------------------------------------------------
-- CLIENTE
-- ---------------------------------------------------------
CREATE TABLE cliente (
    cliente_id VARCHAR(14) PRIMARY KEY,  -- CPF/CNPJ
    nome       VARCHAR(100) NOT NULL,
    telefone   VARCHAR(11) NOT NULL,
    email      VARCHAR(100) NOT NULL,
    version    INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------
-- VEICULO
-- ---------------------------------------------------------
CREATE TABLE veiculo (
    veiculo_id VARCHAR(36) PRIMARY KEY, -- UUID técnico
    placa      VARCHAR(7) NOT NULL UNIQUE,
    modelo     VARCHAR(30) NOT NULL,
    ano        INTEGER NOT NULL,
    marca      VARCHAR(16) NOT NULL,
    cor        VARCHAR(15) NOT NULL,
    version    INTEGER NOT NULL DEFAULT 0,
    cliente_id VARCHAR(14) NOT NULL,
    CONSTRAINT fk_veiculo_cliente
        FOREIGN KEY (cliente_id)
        REFERENCES cliente(cliente_id)
);

-- ---------------------------------------------------------
-- SERVICO (catálogo de serviços)
-- ---------------------------------------------------------
CREATE TABLE servico (
    servico_id  BIGSERIAL PRIMARY KEY,
    titulo      VARCHAR(20) NOT NULL,
    descricao   VARCHAR(200),
    valor       BIGINT NOT NULL  -- valor em centavos, por exemplo
);

-- ---------------------------------------------------------
-- MARCA_PECA_INSUMO
-- ---------------------------------------------------------
CREATE TABLE marca_peca_insumo (
    marca_id BIGSERIAL PRIMARY KEY,
    nome     VARCHAR(20) NOT NULL
);

-- ---------------------------------------------------------
-- CATEGORIA_PECA
-- ---------------------------------------------------------
CREATE TABLE categoria_peca (
    categoria_peca_id BIGSERIAL PRIMARY KEY,
    nome              VARCHAR(20) NOT NULL,
    descricao         VARCHAR(200)
);

-- ---------------------------------------------------------
-- PECA_INSUMO
-- ---------------------------------------------------------
CREATE TABLE peca_insumo (
    item_id           BIGSERIAL PRIMARY KEY,
    nome              VARCHAR(20) NOT NULL,
    descricao         VARCHAR(200),
    valor             BIGINT NOT NULL,
    marca_id          BIGINT,
    categoria_peca_id BIGINT,
    CONSTRAINT fk_peca_marca
        FOREIGN KEY (marca_id)
        REFERENCES marca_peca_insumo(marca_id),
    CONSTRAINT fk_peca_categoria
        FOREIGN KEY (categoria_peca_id)
        REFERENCES categoria_peca(categoria_peca_id)
);

-- ---------------------------------------------------------
-- USUARIO (comum / administrador)
-- ---------------------------------------------------------
CREATE TABLE usuario (
    usuario_id  BIGSERIAL PRIMARY KEY,
    nome        VARCHAR(100) NOT NULL,
    email       VARCHAR(100) UNIQUE NOT NULL,
    senha_hash  VARCHAR(255) NOT NULL,
    tipo        VARCHAR(20) NOT NULL CHECK (tipo IN ('COMUM', 'ADMIN')),
    ativo       BOOLEAN NOT NULL DEFAULT TRUE
);

-- ---------------------------------------------------------
-- ORDEM_SERVICO
-- ---------------------------------------------------------
CREATE TABLE ordem_servico (
    os_id                BIGSERIAL PRIMARY KEY,
    cliente_id           VARCHAR(14) NOT NULL,
    veiculo_id           VARCHAR(36) NOT NULL,
    descricao            TEXT,  -- reclamação do usuário
    status               VARCHAR(30) NOT NULL DEFAULT 'RECEBIDA'
        CHECK (status IN (
            'RECEBIDA',
            'EM_DIAGNOSTICO',
            'AGUARDANDO_APROVACAO',
            'EM_EXECUCAO',
            'FINALIZADA',
            'ENTREGUE'
        )),
    criado_em            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    usuario_criacao_id   BIGINT,
    avaliacao            NUMERIC(2,1),  -- 1 a 10
    avaliacao_desc       TEXT,
    CONSTRAINT fk_os_cliente
        FOREIGN KEY (cliente_id)
        REFERENCES cliente(cliente_id),
    CONSTRAINT fk_os_veiculo
        FOREIGN KEY (veiculo_id)
        REFERENCES veiculo(veiculo_id),
    CONSTRAINT fk_os_usuario_criacao
        FOREIGN KEY (usuario_criacao_id)
        REFERENCES usuario(usuario_id)
);

-- ---------------------------------------------------------
-- SERVICOS_OS (serviços vinculados a uma OS)
-- ---------------------------------------------------------
CREATE TABLE servicos_os (
    os_id          BIGINT NOT NULL,
    servico_id     BIGINT NOT NULL,
    quantidade     NUMERIC(10,2) NOT NULL DEFAULT 1,
    valor_unitario BIGINT NOT NULL,
    valor_total    BIGINT NOT NULL,
    observacao     TEXT,
    CONSTRAINT pk_servicos_os
        PRIMARY KEY (os_id, servico_id),
    CONSTRAINT fk_servicos_os_os
        FOREIGN KEY (os_id)
        REFERENCES ordem_servico(os_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_servicos_os_servico
        FOREIGN KEY (servico_id)
        REFERENCES servico(servico_id)
);

-- ---------------------------------------------------------
-- INSUMOS_OS (peças/insumos vinculados a uma OS)
-- ---------------------------------------------------------
CREATE TABLE insumos_os (
    os_id          BIGINT NOT NULL,
    item_id        BIGINT NOT NULL,
    quantidade     NUMERIC(10,2) NOT NULL DEFAULT 1,
    valor_unitario BIGINT NOT NULL,
    valor_total    BIGINT NOT NULL,
    baixa_estoque  BOOLEAN NOT NULL DEFAULT FALSE,
    observacao     TEXT,
    CONSTRAINT pk_insumos_os
        PRIMARY KEY (os_id, item_id),
    CONSTRAINT fk_insumos_os_os
        FOREIGN KEY (os_id)
        REFERENCES ordem_servico(os_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_insumos_os_item
        FOREIGN KEY (item_id)
        REFERENCES peca_insumo(item_id)
);

-- ---------------------------------------------------------
-- ORCAMENTO
-- ---------------------------------------------------------
CREATE TABLE orcamento (
    orcamento_id   BIGSERIAL PRIMARY KEY,
    os_id          BIGINT NOT NULL UNIQUE,
    valor_total    BIGINT NOT NULL,
    status         VARCHAR(20) NOT NULL DEFAULT 'PENDENTE'
        CHECK (status IN ('PENDENTE', 'APROVADO', 'RECUSADO')),
    data_criacao   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_validade  TIMESTAMP,
    data_aprovacao TIMESTAMP,
    motivo_recusa  TEXT,
    observacao     TEXT,
    CONSTRAINT fk_orcamento_os
        FOREIGN KEY (os_id)
        REFERENCES ordem_servico(os_id)
        ON DELETE CASCADE
);

-- ---------------------------------------------------------
-- ESTOQUE (saldo por item)
-- ---------------------------------------------------------
CREATE TABLE estoque (
    estoque_id           BIGSERIAL PRIMARY KEY,
    item_id              BIGINT NOT NULL UNIQUE,
    quantidade_disponivel NUMERIC(10,2) NOT NULL DEFAULT 0,
    quantidade_minima    NUMERIC(10,2) NOT NULL DEFAULT 0,
    CONSTRAINT fk_estoque_item
        FOREIGN KEY (item_id)
        REFERENCES peca_insumo(item_id)
);

-- ---------------------------------------------------------
-- MOVIMENTO_ESTOQUE (histórico de entradas/saídas)
-- ---------------------------------------------------------
CREATE TABLE movimento_estoque (
    movimento_id BIGSERIAL PRIMARY KEY,
    item_id      BIGINT NOT NULL,
    tipo         VARCHAR(20) NOT NULL
        CHECK (tipo IN ('ENTRADA', 'SAIDA', 'AJUSTE')),
    quantidade   NUMERIC(10,2) NOT NULL,
    data_hora    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    usuario_id   BIGINT,
    os_id        BIGINT,
    observacao   TEXT,
    CONSTRAINT fk_movimento_item
        FOREIGN KEY (item_id)
        REFERENCES peca_insumo(item_id),
    CONSTRAINT fk_movimento_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES usuario(usuario_id),
    CONSTRAINT fk_movimento_os
        FOREIGN KEY (os_id)
        REFERENCES ordem_servico(os_id)
);

-- ---------------------------------------------------------
-- OS_STATUS_HISTORICO
-- ---------------------------------------------------------
CREATE TABLE os_status_historico (
    os_status_id BIGSERIAL PRIMARY KEY,
    os_id        BIGINT NOT NULL,
    status       VARCHAR(30) NOT NULL
        CHECK (status IN (
            'RECEBIDA',
            'EM_DIAGNOSTICO',
            'AGUARDANDO_APROVACAO',
            'EM_EXECUCAO',
            'FINALIZADA',
            'ENTREGUE'
        )),
    valor        BIGINT CHECK (valor IS NULL OR valor >= 0),
    data_hora    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    usuario_id   BIGINT,
    observacao   TEXT,
    CONSTRAINT fk_status_os
        FOREIGN KEY (os_id)
        REFERENCES ordem_servico(os_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_status_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES usuario(usuario_id)
);

