# API Oficina Mecânica

Backend do Tech Challenge — FIAP, Fase 1, voltado à gestão de uma oficina mecânica. O projeto está em TypeScript, utiliza Fastify e organiza o domínio em um monólito modular com conceitos de Domain-Driven Design (DDD).

> Este README descreve o estado confirmado no código analisado. Itens previstos no enunciado, mas ainda não comprovados no repositório, estão identificados como pendências.

## Contexto e objetivo

O sistema modela quatro contextos principais:

- **Registry:** cadastro e consulta de clientes e veículos.
- **Service Order:** ordens de serviço, orçamento, itens e eventos de domínio.
- **Stock:** peças/insumos, entradas, reservas, consumo e baixa de estoque.
- **Auth:** usuários, primeiro acesso, login JWT, papéis e pré-cadastro por gerente.

O documento oficial `Fase 1 - Tech Challenge.pdf` não está presente na árvore analisada; os requisitos acadêmicos considerados aqui são os fornecidos na especificação da tarefa.

## Estado atual

| Capacidade                                            | Estado                                         | Evidência / observação                                                                                                                 |
| ----------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Cadastrar cliente                                     | **Implementado e validado via integração E2E** | `src/registry/application/use-cases/register-customer.ts`, `DrizzleCustomerRepository` e rota `POST /customers`                        |
| Consultar cliente por CPF/CNPJ                        | **Implementado**                               | `find-customer-by-document.ts`, `DrizzleCustomerRepository` e `GET /customers/:cpfCnpj`                                                |
| Cadastrar veículo                                     | **Implementado e validado via integração E2E** | `register-vehicle.ts`, `DrizzleVehicleRepository` e `POST /vehicles`                                                                   |
| Consultar veículo por placa                           | **Implementado**                               | `find-vehicle-by-plate.ts`, `DrizzleVehicleRepository` e `GET /vehicles/:plate`                                                        |
| Validação de CPF/CNPJ, e-mail, telefone e placa       | **Implementado**                               | Value objects em `src/registry/domain/**/value-objects`                                                                                |
| Ordens de serviço no domínio                          | **Implementado e validado via integração E2E** | Repositórios Drizzle, catálogo de serviços, ciclo de execução/entrega e rotas HTTP                                                     |
| Histórico de fases da OS                              | **Implementado e validado via integração E2E** | Tabela `service_order.order_status_history` (`status`, `value_cents`, `changed_by`, `recorded_at`) e `GET /service-orders/:id/history` |
| Orçamento e aprovação/rejeição                        | **Implementado e validado via integração E2E** | Persistência atômica orçamento+OS, envio de link único por e-mail (MailHog/SMTP), aprovação, recusa, revogação e expiração             |
| Estoque e reservas                                    | **Parcialmente implementado**                  | Agregados, casos de uso, handlers e testes existem; não há endpoints nem repositórios PostgreSQL correspondentes                       |
| CRUD completo de clientes, veículos, serviços e peças | **Pendente / parcial**                         | Foram encontradas operações de criação e consulta de clientes, veículos e serviços; atualização e exclusão não estão expostas          |
| Autenticação JWT e autorização administrativa         | **Isolamento preparado via Porta/Adaptador**   | `ActorResolver` + `TokenActorResolver` desacoplados prontos para receber `JoseTokenService` / `ResolveAuthenticatedUser`               |
| Dockerfile da aplicação e Docker Compose completo     | **Pendente**                                   | Existe Compose para PostgreSQL/MailHog e SonarQube, mas não para a aplicação                                                           |

## Arquitetura e DDD

A solução é um monólito modular organizado em camadas:

- `domain/`: entidades/agregados, objetos de valor, eventos e contratos de repositório.
- `application/use-cases/`: orquestração dos casos de uso.
- `application/handlers/`: consumidores e políticas acionadas por eventos.
- `infra/`: adaptadores HTTP, envio de e-mail SMTP e persistência.
- `shared/`: abstrações compartilhadas, exceções, IDs, eventos e Event Bus.

Os agregados e conceitos identificados incluem `Customer`, `Vehicle`, `ServiceOrder`, `Budget`, `ApprovalRequest`, `PartSupply`, `SupplyReservation` e `User`. Entre os objetos de valor estão `CpfCnpj`, `Email`, `Telephone`, `Plate`, `Quantity`, `UnitOfMeasure`, `PartCode`, `Role` e objetos de status.

Os módulos se comunicam por um `InMemoryEventBus`, implementado em `src/shared/application/in-memory-event-bus.ts`. A decisão está registrada em [`docs/adr/event-bus.md`](docs/adr/event-bus.md). O desenho atual assume consistência eventual entre contextos, com handlers para notificação de orçamento/retirada e para reservar, liberar, consumir e baixar insumos.

### Status de ordem de serviço

O domínio usa os valores em inglês `PENDING`, `AWAITING_APPROVAL`, `REJECTED`, `APPROVED`, `IN_PROGRESS`, `PAUSED`, `COMPLETED`, `DELIVERED` e `CANCELLED`, com transições definidas em `src/service-order/domain/service-order/value-objects/service-order-status.ts`:

```text
PENDING            -> AWAITING_APPROVAL | APPROVED | CANCELLED
AWAITING_APPROVAL  -> APPROVED | REJECTED | CANCELLED
REJECTED           -> (final)
APPROVED           -> IN_PROGRESS | CANCELLED
IN_PROGRESS        -> PAUSED | COMPLETED | CANCELLED
PAUSED             -> IN_PROGRESS | CANCELLED
COMPLETED          -> DELIVERED
DELIVERED          -> (final)
CANCELLED          -> (final)
```

Estados encerrados ou terminais (`COMPLETED`, `DELIVERED`, `REJECTED` e `CANCELLED`, identificados por `ServiceOrderStatus.isClosed()`) bloqueiam a inclusão de novos insumos (`addSupply`).

### Histórico de fases da OS e isolamento com o módulo de Auth

Cada transição de fase da OS é registrada cronologicamente em `service_order.order_status_history` (migração `infra/postgres/init/05-order-status-history.sql`) com:

- `status`: fase da OS (`PENDING`, `AWAITING_APPROVAL`, `APPROVED`, `REJECTED`, `IN_PROGRESS`, `PAUSED`, `COMPLETED`, `DELIVERED`, `CANCELLED`).
- `value_cents` (`valueCents`): valor orçado em centavos quando a vistoria/orçamento já foi realizada (`NULL` na abertura em `PENDING`, gravado diretamente a partir do `Budget` persistido na mesma transação em `AWAITING_APPROVAL` e preservado nas fases subsequentes).
- `changed_by` (`changedBy`): identificador do usuário autenticado que efetuou a mudança ou `NULL` em transições públicas/automáticas (aprovação/recusa pelo cliente via link de e-mail ou expiração de token).
- `recorded_at` (`recordedAt`): data/hora da mudança de fase.

Para identificar o usuário sem quebrar o isolamento entre os módulos `service-order` e `auth` (que utiliza JWT com `jose`):

1. **Porta no módulo `service-order` (`src/service-order/application/ports/actor-resolver.ts`):** define o contrato `ActorResolver` (`resolve(authorizationHeader?: string): Promise<string | null>`) e o contexto assíncrono `actorContext` (`AsyncLocalStorage<string | null>`). O módulo `service-order` não importa nada de `src/auth/` nem conhece JWT ou `jose`.
2. **Adaptador por tipagem estrutural em `src/infra/token-actor-resolver.ts`:** `TokenActorResolver` extrai o token `Bearer <jwt>` do header `Authorization` e aceita, por _structural typing_ (`TokenVerifier`), tanto `JoseTokenService` (`{ verify(token): Promise<string | null> }`) quanto `ResolveAuthenticatedUser` (`{ execute(token): Promise<{ id: { value: string } }> }`) do módulo `auth`. Para conectá-lo no bootstrap (`src/index.ts`), basta injetar `actorResolver: new TokenActorResolver(tokenService)` no `serviceOrderCompositionRoot`.
3. **Propagação via `AsyncLocalStorage` (`src/service-order/infra/http/service-order-routes.ts`):** um hook `preHandler` do Fastify resolve o ator no início da requisição e executa o handler dentro de `actorContext.run(actorId, done)`. Assim, `DrizzleServiceOrderRepository` e `DrizzleApprovalRequestRepository` gravam `changed_by` automaticamente sem acoplar entidades de domínio ou casos de uso a headers HTTP.
4. **Desacoplamento no banco:** a coluna `changed_by VARCHAR(320)` em `service_order.order_status_history` não possui _foreign key_ cruzada para `public.auth_users`, preservando a autonomia de schema de cada contexto delimitado e aceitando tanto UUID quanto `sub`/e-mail do JWT.

### Documentação DDD

- ADR do Event Bus: [`docs/adr/event-bus.md`](docs/adr/event-bus.md)
- Fluxos Auth: [`docs/plantuml/flows/auth-service.puml`](docs/plantuml/flows/auth-service.puml)
- Event Storming: **[PREENCHER: inserir link ou caminho do artefato]**
- Diagrama de domínio / linguagem ubíqua / glossário: **[PREENCHER: inserir link ou caminho]**

## Tecnologias

- Node.js e TypeScript ESM (`module: nodenext`), modo estrito.
- Fastify 5, Zod e `fastify-type-provider-zod`.
- Drizzle ORM, `drizzle-kit` e `pg`.
- Nodemailer e MailHog para envio e teste de e-mails transacionais.
- PostgreSQL 17 no ambiente Docker do banco.
- Argon2id para senhas, `jose` para JWT e `@fastify/rate-limit` para limitar tentativas de autenticação.
- Vitest 5 para testes.
- ESLint, Prettier e configuração opcional de SonarQube.

## Pré-requisitos

- Node.js compatível com TypeScript 6 e as dependências do `package.json`.
- npm.
- Docker e Docker Compose para executar o PostgreSQL e o MailHog.

As versões exatas de Node.js e npm não estão fixadas por `.nvmrc`, `engines` ou equivalente; **[PREENCHER: registrar versões oficiais da entrega]**.

## Configuração do ambiente

Instale as dependências:

```bash
npm install
```

O banco lê `infra/postgres/.env`. Crie esse arquivo a partir do exemplo, sem versionar credenciais:

```bash
cp infra/postgres/.env.example infra/postgres/.env
```

Variáveis reconhecidas:

```text
POSTGRES_USER=<usuário do PostgreSQL>
POSTGRES_PASSWORD=<senha do PostgreSQL>
POSTGRES_DB=<nome do banco>
POSTGRES_PORT=<porta local, normalmente 5432>
SMTP_HOST=<host SMTP, ex.: localhost>
SMTP_PORT=<porta SMTP, ex.: 1025>
SMTP_FROM=<remetente, ex.: oficina@localhost>
FRONTEND_URL=<URL base para links de aprovação, ex.: http://localhost:3000>
APPROVAL_TOKEN_TTL_MINUTES=<validade do link de aprovação em minutos>
DATABASE_URL=<opcional; tem prioridade sobre as variáveis individuais>
INITIAL_MANAGER_PASSWORD=<senha temporária do gerente inicial; obrigatória>
JWT_SECRET=<chave de assinatura JWT; obrigatória, com pelo menos 32 bytes>
```

As duas últimas variáveis são usadas pelo bootstrap da aplicação; podem ser definidas no ambiente do processo. `src/infra/database/connection.ts` também carrega `infra/postgres/.env` no desenvolvimento. O arquivo `.env` real não deve ser publicado; não use os valores de exemplo como senhas reais.

## Banco de dados

O banco identificado no projeto é o **PostgreSQL**. A escolha está refletida em `pg`, `drizzle-orm/node-postgres`, `drizzle.config.ts`, `infra/postgres/docker-compose.yml` e nos scripts SQL iniciais. O README do banco também registra a justificativa operacional para uso de PostgreSQL com Docker e Drizzle.

Há duas representações no banco:

- `src/infra/database/schema.ts` contém tabelas Drizzle para cliente, veículo e serviço, além do schema `service_order` para OS (`orders`), itens (`supply_items`), orçamentos (`budgets`), solicitações de aprovação (`approval_requests`), catálogo de serviços (`services`, `service_parts`, `order_services`) e histórico de fases da OS (`order_status_history`).
- `infra/postgres/init/01-schema.sql` contém o modelo legado em `public` (incluindo `peca_insumo`, validada ao vincular peças a serviços do catálogo, e `os_status_historico`).

Os scripts SQL em `infra/postgres/init/` (`01-schema.sql` a `05-order-status-history.sql`) são executados automaticamente quando o volume do PostgreSQL é criado pela primeira vez. Os scripts disponíveis são:

```bash
npm run db:generate
npm run db:migrate
npm run db:push
npm run db:studio
npm run db:test
```

Os repositórios Drizzle de OS, orçamento, catálogo de serviços e aprovação implementam os contratos com transações e controle otimista/pessimista de versão. Para um volume existente, aplique os scripts incrementais conforme o [README do PostgreSQL](infra/postgres/README.md).

## Execução local

Inicie o banco e o MailHog:

```bash
cd infra/postgres
docker compose up -d
cd ../..
npm run db:migrate
```

Depois, os scripts do projeto são:

```bash
npm run dev          # desenvolvimento; executa src/index.ts em watch
npm run build        # compila para dist/
npm start            # executa dist/index.js
```

O bootstrap HTTP existente é `src/index.ts`. A aplicação usa `HOST=0.0.0.0` e `PORT=3000` por padrão, podendo receber essas variáveis pelo ambiente, além de executar periodicamente `expirePending` para expirar solicitações de aprovação vencidas. A inicialização depende de uma conexão PostgreSQL válida, de `INITIAL_MANAGER_PASSWORD` não vazia e de `JWT_SECRET` com pelo menos 32 bytes; sem essas variáveis, ela falha antes de abrir a porta.

### Fluxo de autenticação

Para instruções de uso e permissões por papel, consulte o [guia de autenticação e autorização](docs/authorization.md).

Na primeira execução com `auth_users` vazia, o bootstrap cria `admin@admin.com` como `GERENTE` em estado `PENDING_FIRST_ACCESS`, com a senha temporária definida em `INITIAL_MANAGER_PASSWORD` armazenada como hash Argon2id. O seed não redefine a senha em reinicializações nem cria outro gerente caso já existam usuários.

1. Envie `POST /auth/first-access` com `{"email":"admin@admin.com","temporaryPassword":"<senha temporária>","newPassword":"<nova senha>"}`. A nova senha deve ser diferente, ter pelo menos 8 caracteres e conter somente letras e números. Sucesso: `204`.
2. Envie `POST /auth/login` com `{"email":"admin@admin.com","password":"<nova senha>"}`. Um usuário `ACTIVE` recebe `{"token":"<jwt>"}`; o token HS256 expira em 4 horas. Usuários pendentes devem concluir o primeiro acesso antes de fazer login.
3. Com o token do gerente, envie `POST /users` com `Authorization: Bearer <jwt>` e `{"email":"pessoa@example.com","role":"ATENDENTE"}`. Sucesso: `201` com `{"temporaryPassword":"<senha gerada>"}`. Entregue essa senha ao usuário por canal seguro: ela é retornada em claro nessa única resposta e o novo usuário também deverá fazer primeiro acesso.

Papéis aceitos: `ATENDENTE`, `MECANICO`, `ESTOQUISTA` e `GERENTE`. Apenas o gerente ativo tem permissão para pré-cadastrar usuários. O controller consulta o usuário no banco a cada requisição autenticada, para que desativação ou mudança de papel não espere o JWT expirar. Login e primeiro acesso têm limite de **5 requisições por minuto por IP e por rota** (`429` ao exceder), armazenado na memória do processo; múltiplas instâncias exigiriam um armazenamento compartilhado. Use HTTPS ao expor senhas e tokens.

## Docker

O Compose disponível em [`infra/postgres/docker-compose.yml`](infra/postgres/docker-compose.yml) provisiona os serviços `postgres` e `mailhog` (SMTP na porta 1025 e interface web na porta 8025).

```bash
cd infra/postgres
docker compose up -d
docker compose ps
docker compose logs -f postgres
docker compose down
```

Não existe `Dockerfile` da aplicação nem `docker-compose.yml` na raiz orquestrando API e banco. O Compose de SonarQube está em [`infra/sonarqube/docker-compose.yml`](infra/sonarqube/docker-compose.yml).

## API HTTP

O Fastify registra Swagger e Swagger UI em `/docs`. A especificação OpenAPI é gerada a partir das rotas registradas.

| Método | Rota                                                       | Finalidade                                                                             | Autenticação / Permissão                         |
| ------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `GET`  | `/health`                                                  | Verifica a aplicação e executa `SELECT 1` no banco                                     | Não                                              |
| `POST` | `/auth/first-access`                                       | Troca a senha temporária no primeiro acesso                                            | Não (rate-limit: 5/min por IP)                   |
| `POST` | `/auth/login`                                              | Autentica usuário ativo e emite JWT HS256 (4h)                                         | Não (rate-limit: 5/min por IP)                   |
| `POST` | `/users`                                                   | Pré-cadastra usuário com senha temporária                                              | Bearer JWT (`USUARIO_PRE_CADASTRAR` — `GERENTE`) |
| `POST` | `/customers`                                               | Cadastra cliente                                                                       | Não                                              |
| `GET`  | `/customers/:cpfCnpj`                                      | Consulta cliente por CPF/CNPJ                                                          | Não                                              |
| `POST` | `/vehicles`                                                | Cadastra veículo vinculado a cliente                                                   | Não                                              |
| `GET`  | `/vehicles/:plate`                                         | Consulta veículo por placa                                                             | Não                                              |
| `POST` | `/service-orders`                                          | Cadastra OS (`description`, `vehicleId`, `valueCents` opcional)                        | Bearer JWT (`OS_CRIAR`)                          |
| `GET`  | `/service-orders/:serviceOrderId`                          | Consulta OS (`valueCents` e insumos `supplies` associados)                             | Bearer JWT (qualquer papel ativo)                |
| `GET`  | `/service-orders/:serviceOrderId/history`                  | Consulta histórico de fases da OS (`status`, `valueCents`, `changedBy` e `recordedAt`) | Bearer JWT (qualquer papel ativo)                |
| `POST` | `/service-orders/:serviceOrderId/supplies`                 | Inclui insumo (`partCode`, `quantity`)                                                 | Bearer JWT (`ESTOQUE_BAIXAR`)                    |
| `POST` | `/service-orders/:serviceOrderId/supplies/:partCode/usage` | Registra uso do insumo                                                                 | Bearer JWT (`ESTOQUE_BAIXAR`)                    |
| `PATCH` | `/service-orders/:serviceOrderId/description`             | Atualiza a descrição durante a avaliação da OS em `PENDING`                            | Bearer JWT (`OS_CONCLUIR`)                       |
| `POST` | `/service-orders/:serviceOrderId/awaiting-approval`        | Define/atualiza `valueCents` e `description` (opcionais), gera orçamento e envia link de aprovação | Bearer JWT (`OS_CONCLUIR`)               |
| `POST` | `/service-orders/:serviceOrderId/start`                    | Inicia execução da OS (`IN_PROGRESS`)                                                  | Bearer JWT (`OS_CONCLUIR`)                       |
| `POST` | `/service-orders/:serviceOrderId/finish`                   | Finaliza execução da OS (`COMPLETED`) e notifica cliente                               | Bearer JWT (`OS_CONCLUIR`)                       |
| `POST` | `/service-orders/:serviceOrderId/deliver`                  | Registra entrega do veículo (`DELIVERED`)                                              | Bearer JWT (`OS_CRIAR`)                          |
| `POST` | `/service-orders/:serviceOrderId/cancel`                   | Cancela OS                                                                             | Bearer JWT (`OS_CRIAR`)                          |
| `POST` | `/budget-approvals/decide`                                 | Confirma aprovação ou recusa do orçamento por token                                    | Pública (link de uso único enviado por e-mail)   |
| `GET`  | `/orcamento/:token` e `/orcamento`                         | Página web de aprovação/recusa do orçamento                                            | Pública                                          |
| `GET`  | `/docs`                                                    | Interface Swagger UI                                                                   | Não                                              |

A validação de payload usa Zod; erros de validação retornam HTTP 400 e exceções de aplicação/domínio são convertidas pelo error handler central em `src/app.ts`.

Durante a avaliação (`PENDING`), mecânico e gerente podem salvar ou revisar a descrição com `PATCH /service-orders/:serviceOrderId/description`, enviando `{ "description": "Pastilhas desgastadas; substituir o par dianteiro." }`. O texto substitui o campo `description` da OS, deve conter conteúdo e tem os espaços das extremidades removidos. Também pode ser informado junto de `valueCents` no envio para aprovação; quando omitido, a descrição anterior é preservada. O texto salvo aparece na consulta da OS e no e-mail do orçamento. A edição fica bloqueada após o envio para aprovação.

Os controllers de OS usam `DrizzleServiceOrderRepository`, `DrizzleBudgetRepository`, `DrizzleApprovalRequestRepository` e a mesma instância de `InMemoryEventBus` usada no cadastro. A OS guarda `vehicleId` e `valueCents` (informado manualmente no cadastro ou antes de enviar para aprovação); `RegistryVehicleContactLookup` valida a existência do veículo e consulta o contato do cliente. Ao acionar `POST /service-orders/:serviceOrderId/awaiting-approval`, o orçamento é gerado a partir do `valueCents` da OS e persistido (`PENDING`) **atomicamente na mesma transação** que a transição da OS para `AWAITING_APPROVAL`; em seguida, o evento `service-order.awaiting-approval` emite um token de uso único por e-mail (persistindo apenas o hash SHA-256 em `service_order.approval_requests`). A decisão é confirmada via `POST /budget-approvals/decide` (`approved` ou `rejected`), atualizando orçamento e OS. Cancelar uma OS (`POST /service-orders/:serviceOrderId/cancel`) revoga na mesma transação quaisquer solicitações de aprovação pendentes, e a rotina periódica `expirePending` filtra ordens em `AWAITING_APPROVAL` antes do limite de lote (`LIMIT 100`). Ao finalizar a OS (`POST /service-orders/:serviceOrderId/finish`), o evento `service-order.finished` envia o e-mail informando que o veículo está pronto para retirada. Todas as mudanças de fase são gravadas em `service_order.order_status_history` com data (`recordedAt`), valor (`valueCents`) e autor da transição (`changedBy`, resolvido via `ActorResolver` / `TokenActorResolver` a partir do header `Authorization: Bearer <jwt>`). Conflitos de versão retornam HTTP 409.

Exemplo de cadastro de OS:

```bash
curl -X POST http://localhost:3000/service-orders \
  -H 'Authorization: Bearer <jwt>' \
  -H 'Content-Type: application/json' \
  -d '{"description":"Troca de pastilhas de freio","vehicleId":"ID_DO_VEICULO","valueCents":15000}'
```

A autenticação (`401 Unauthorized` para token ausente, inválido ou usuário inativo) e a verificação de permissões por papel (`403 Forbidden`) nas rotas de OS são realizadas de forma desacoplada por `ActorResolver` (`src/service-order/application/ports/actor-resolver.ts`) e `TokenActorResolver` (`src/infra/token-actor-resolver.ts`), sem acoplamento direto entre `src/service-order/` e `src/auth/`.

## Testes e qualidade

Comandos disponíveis:

```bash
npm test
npm run test:coverage
npm run typecheck
npm run lint
npm run format:check
npm run build
```

Na análise desta versão:

- **61 arquivos de teste** (60 suítes unitárias/HTTP + 1 suíte de integração E2E com PostgreSQL e MailHog reais).
- **477 testes** (476 testes unitários/HTTP + 1 fluxo E2E completo).
- `typecheck`, `lint` e `build` concluíram sem erros.

Os testes incluem testes unitários de domínio/aplicação, testes de repositórios Drizzle, testes de rotas HTTP via `app.inject` (incluindo primeiro acesso, login e pré-cadastro em `src/app.spec.ts`) e o teste de integração ponta a ponta (`src/service-order/infra/http/service-order-real.integration.spec.ts`) validado contra PostgreSQL e MailHog reais.

## Estrutura relevante

```text
src/
├── app.ts                         # Fastify, Swagger, health check e erros
├── index.ts                       # bootstrap da aplicação
├── composition-root.ts            # composição dos módulos e Event Bus
├── auth/                          # usuários, autenticação, autorização e adaptadores
├── shared/                        # abstrações comuns
├── registry/                      # clientes e veículos
├── service-order/                 # OS, orçamento, catálogo, aprovação, histórico e eventos
├── stock/                         # estoque, reservas e handlers
└── infra/                         # conexão, schema, repositórios Drizzle e adaptadores cross-module

infra/
├── postgres/                      # Compose (PostgreSQL + MailHog), .env.example e scripts SQL
└── sonarqube/                     # Compose do SonarQube

docs/adr/                          # decisões arquiteturais
docs/plantuml/flows/auth-service.puml  # sequência de pré-cadastro e login
drizzle/                           # migrações versionadas de auth_users
```

## Decisões e limitações conhecidas

- O Event Bus é in-process/in-memory; não há durabilidade, retry automático, DLQ ou replay.
- A consistência entre contextos é eventual e os handlers são preparados para idempotência em cenários específicos.
- A API HTTP cobre autenticação/pré-cadastro (`auth`), cadastro de clientes/veículos (`registry`), catálogo de serviços e ciclo completo da OS (criação, associação de serviços, insumos, envio de orçamento para aprovação, decisão de aprovação/recusa por token, consulta de histórico de fases com autor via `ActorResolver` / `TokenActorResolver`, início, finalização, entrega e cancelamento) e health check.
- Não há Dockerfile da API nem Compose completo da aplicação.

## Links e informações da entrega

- Repositório: **[PREENCHER: inserir URL pública do repositório]**
- Vídeo de apresentação: **[PREENCHER: inserir link público do YouTube]**
- Documentação DDD: **[PREENCHER: inserir link público ou manter os caminhos locais acima]**
- Grupo: **[PREENCHER]**
- Integrantes e RMs: **[PREENCHER]**
- Usuário do Discord: **[PREENCHER]**
- Branch entregue: `feat/service-order-integration`
- Commit analisado: **[PREENCHER: registrar o commit da entrega]**
- Versão da entrega: **[PREENCHER]**

## Status da documentação

README elaborado a partir da árvore do repositório, `package.json`, configurações TypeScript/Drizzle, código de domínio/aplicação, rotas, testes, Docker e documentação existente. Os placeholders devem ser preenchidos manualmente antes da entrega acadêmica final.
