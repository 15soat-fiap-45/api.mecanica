# ADR: PostgreSQL como banco de dados do sistema

**Status:** Aceito
**Data:** 29/10/2026

## Contexto

O sistema da oficina mecânica persiste clientes, veículos, ordens de serviço, insumos e reservas de estoque, movimentações de estoque, orçamentos, pedidos de aprovação, histórico de status, usuários e indicadores de BI. O domínio é fortemente relacional e tem invariantes que não podem ser violadas, mesmo com requisições concorrentes:

- Uma OS pertence a um veículo, que pertence a um cliente.
- Só pode existir um pedido de aprovação ativo por OS.
- Só pode existir uma reserva aberta por OS e insumo.
- Só pode existir um ciclo de reposição aberto por peça.
- Quantidades e valores devem ser consistentes (`quantity > 0`, `total_cents >= 0`).
- Orçamento e OS precisam ser gravados de forma atômica.

O projeto é um MVP, o que torna relevantes a disponibilidade de documentação e exemplos, o custo e a facilidade de manter o ambiente local e de testes.

## Alternativas consideradas

### 1. PostgreSQL

**Prós**

- Modelo relacional com FKs, `CHECK`, enums e transações ACID.
- Índices únicos parciais, usados para garantir no banco as regras "um pedido de aprovação ativo por OS", "uma reserva aberta por OS e insumo" e "um ciclo de reposição aberto por peça".
- Tipos adequados ao domínio: `uuid`, `timestamptz`, `pgEnum`.
- Schemas por contexto (`service_order`, `business_intelligence`), coerentes com os bounded contexts do DDD.
- Gratuito e de código aberto, com imagem oficial para Docker (healthcheck e volume no Compose).
- Padrão atual para MVPs relacionais, com grande volume de documentação e exemplos, o que reduz o risco de acumular débito técnico.
- Suporte maduro em Node.js (`pg`) e no ORM adotado (Drizzle ORM e Drizzle Kit).

**Contras**

- Escala de escrita é vertical em primeira instância.
- Exige operar o servidor (backup, atualização de versão) enquanto não houver serviço gerenciado.

### 2. Outros SGBDs relacionais (MySQL/MariaDB, SQL Server, Oracle, SQLite)

**Prós**

- Também oferecem transações ACID, FKs e `CHECK`.
- Têm ecossistema e documentação extensos.

**Contras**

- MySQL/MariaDB: sem índice único parcial nativo, então as regras acima dependeriam de colunas geradas ou de código na aplicação.
- SQL Server e Oracle: custo de licença e imagens de desenvolvimento mais pesadas, sem ganho funcional para este domínio.
- SQLite: banco em arquivo, com escrita concorrente limitada, inadequado a uma API com múltiplas requisições e a um ambiente de produção.

### 3. NoSQL de documentos (MongoDB, DynamoDB)

**Prós**

- Esquema flexível e escala horizontal.

**Contras**

- O domínio é relacional e tem poucas variações de estrutura, então a flexibilidade de esquema traz pouco.
- Sem FKs nativas: a integridade entre coleções passaria para a aplicação.
- Invariantes como as de unicidade condicional exigiriam código e tratamento de concorrência na aplicação.
- Transações multi-documento (MongoDB) ou limitadas (DynamoDB) tornam a atomicidade orçamento + OS mais complexa.
- Consultas de BI com agregações entre entidades ficam mais difíceis sem joins.

### 4. Chave-valor e colunar (Redis, Cassandra)

**Prós**

- Alta performance de leitura (Redis) e escala de escrita (Cassandra).

**Contras**

- Não atendem o modelo transacional e relacional do sistema.
- Redis só faria sentido no futuro como cache, não como banco principal.

## Decisão

Adotar o **PostgreSQL** (versão 17) como banco de dados principal.

O principal motivo é técnico: o domínio é relacional e o banco garante as invariantes por constraints, índices únicos parciais e transações, em vez de depender só do código da aplicação. O segundo motivo é prático: o PostgreSQL é o padrão atual para MVPs relacionais, com ampla documentação e exemplos, o que reduz o risco de débito técnico.

### Como é usado

- Acesso por `pg` com Drizzle ORM (`drizzle-orm/node-postgres`).
- Schemas separados por contexto: `public` (modelo legado, auth, registry e estoque), `service_order` e `business_intelligence`.
- Valores monetários em centavos (`*_cents`) e datas em `timestamptz`.
- Persistência atômica por transação (`db.transaction`) nos repositórios que gravam mais de uma tabela.
- Controle de concorrência otimista por coluna `version` nos agregados.
- Violações de constraint reportadas pelo banco (SQLSTATE `23505` e `23503`) são traduzidas em erros de aplicação (por exemplo, 409 no cadastro).
- Evolução do esquema por dois caminhos: os scripts de `infra/postgres/init`, executados na criação do volume, e as migrações do Drizzle em `drizzle/`, aplicadas pelo serviço `migrate` do Compose (`node dist/infra/database/migrate.js`) ou por `npm run db:migrate:deploy`.
- Ambiente local por Docker Compose, com volume e healthcheck, isolado (`infra/postgres`) ou junto com a API (`docker-compose.yml` da raiz).

### Regras

1. Invariantes de dados devem ser garantidas no banco sempre que possível (constraint ou índice), além da validação no domínio.
2. Operações que alteram mais de uma tabela devem usar transação.
3. O acesso ao banco fica nos repositórios de infraestrutura; domínio e aplicação não conhecem o PostgreSQL.
4. Novas mudanças de esquema entram como migração do Drizzle, idempotentes em relação aos scripts de `init`.

## Consequências

**Positivas**

- Integridade garantida pelo banco, inclusive sob concorrência.
- Atomicidade nos fluxos críticos (orçamento + OS, aprovação).
- Stack madura e bem documentada, com ambiente local simples e reprodutível.
- Sem custo de licença.

**Negativas / riscos aceitos**

- Escala de escrita vertical em primeira instância.
- Backup, atualização e disponibilidade ficam sob responsabilidade da equipe até a adoção de um serviço gerenciado.
- Os dois caminhos de evolução do esquema dependem um do outro: migrações como `0002_create_stock` alteram tabelas criadas pelos scripts de `init`, e `0003` precisa ser idempotente porque o `init` já cria `movimento_estoque`. Isso exige atenção a cada nova migração até os scripts serem absorvidos pelas migrações.
- O schema legado em `public` convive com os schemas novos.
- Os repositórios de estoque ainda gravam item, saldo, movimentações e reservas sem transação, contrariando a regra 2.

## Gatilhos para revisar esta decisão

- Volume de leitura que justifique réplicas de leitura ou cache (Redis).
- Necessidade de escala de escrita além de um nó.
- Um módulo com dado realmente não relacional ou sem esquema fixo.
- Adoção de um provedor de nuvem que torne um serviço gerenciado a opção natural.

Nesses casos, avaliar réplicas e particionamento no próprio PostgreSQL antes de introduzir outro tipo de banco.
