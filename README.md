# API Oficina Mecânica

Backend do Tech Challenge — FIAP, Fase 1, voltado à gestão de uma oficina mecânica. O projeto está em TypeScript, utiliza Fastify e organiza o domínio em um monólito modular com conceitos de Domain-Driven Design (DDD).

> Este README descreve o estado confirmado no código analisado. Itens previstos no enunciado, mas ainda não comprovados no repositório, estão identificados como pendências.

## Contexto e objetivo

O sistema modela três contextos principais:

- **Registry:** cadastro e consulta de clientes e veículos.
- **Service Order:** ordens de serviço, orçamento, itens e eventos de domínio.
- **Stock:** peças/insumos, entradas, reservas, consumo e baixa de estoque.

O documento oficial `Fase 1 - Tech Challenge.pdf` não está presente na árvore analisada; os requisitos acadêmicos considerados aqui são os fornecidos na especificação da tarefa.

## Estado atual

| Capacidade                                            | Estado                                         | Evidência / observação                                                                                                        |
| ----------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Cadastrar cliente                                     | **Implementado, mas não validado via banco**   | `src/registry/application/use-cases/register-customer.ts` e rota `POST /customers`                                            |
| Consultar cliente por CPF/CNPJ                        | **Implementado, mas não validado via banco**   | `find-customer-by-document.ts` e `GET /customers/:cpfCnpj`                                                                    |
| Cadastrar veículo                                     | **Implementado, mas não validado via banco**   | `register-vehicle.ts` e `POST /vehicles`                                                                                      |
| Consultar veículo por placa                           | **Implementado, mas não validado via banco**   | `find-vehicle-by-plate.ts` e `GET /vehicles/:plate`                                                                           |
| Validação de CPF/CNPJ, e-mail, telefone e placa       | **Implementado**                               | Value objects em `src/registry/domain/**/value-objects`                                                                       |
| Ordens de serviço no domínio                          | **Implementado e validado via integração E2E** | Repositórios Drizzle, catálogo de serviços, ciclo de execução/entrega e rotas HTTP                                            |
| Orçamento e aprovação/rejeição                        | **Implementado e validado via integração E2E** | Geração automática a partir dos serviços da OS, envio de link único por e-mail (MailHog/SMTP), aprovação, recusa e expiração  |
| Estoque e reservas                                    | **Parcialmente implementado**                  | Agregados, casos de uso, handlers e testes existem; não há endpoints nem repositórios PostgreSQL correspondentes              |
| CRUD completo de clientes, veículos, serviços e peças | **Pendente / parcial**                         | Foram encontradas operações de criação e consulta de clientes, veículos e serviços; atualização e exclusão não estão expostas |
| Autenticação JWT e autorização administrativa         | **Pendente**                                   | Nenhum plugin, middleware ou caso de uso JWT identificado                                                                     |
| Dockerfile da aplicação e Docker Compose completo     | **Pendente**                                   | Existe Compose para PostgreSQL/MailHog e SonarQube, mas não para a aplicação                                                  |

## Arquitetura e DDD

A solução é um monólito modular organizado em camadas:

- `domain/`: entidades/agregados, objetos de valor, eventos e contratos de repositório.
- `application/use-cases/`: orquestração dos casos de uso.
- `application/handlers/`: consumidores e políticas acionadas por eventos.
- `infra/`: adaptadores HTTP, envio de e-mail SMTP e persistência.
- `shared/`: abstrações compartilhadas, exceções, IDs, eventos e Event Bus.

Os agregados e conceitos identificados incluem `Customer`, `Vehicle`, `ServiceOrder`, `Budget`, `ApprovalRequest`, `PartSupply` e `SupplyReservation`. Entre os objetos de valor estão `CpfCnpj`, `Email`, `Telephone`, `Plate`, `Quantity`, `UnitOfMeasure`, `PartCode` e objetos de status.

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

### Documentação DDD

- ADR do Event Bus: [`docs/adr/event-bus.md`](docs/adr/event-bus.md)
- Event Storming: **[PREENCHER: inserir link ou caminho do artefato]**
- Diagrama de domínio / linguagem ubíqua / glossário: **[PREENCHER: inserir link ou caminho]**

## Tecnologias

- Node.js e TypeScript ESM (`module: nodenext`), modo estrito.
- Fastify 5, Zod e `fastify-type-provider-zod`.
- Drizzle ORM, `drizzle-kit` e `pg`.
- Nodemailer e MailHog para envio e teste de e-mails transacionais.
- PostgreSQL 17 no ambiente Docker do banco.
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
```

O arquivo `.env` real não deve ser publicado.

## Banco de dados

O banco identificado no projeto é o **PostgreSQL**. A escolha está refletida em `pg`, `drizzle-orm/node-postgres`, `drizzle.config.ts`, `infra/postgres/docker-compose.yml` e nos scripts SQL iniciais. O README do banco também registra a justificativa operacional para uso de PostgreSQL com Docker e Drizzle.

Há duas representações no banco:

- `src/infra/database/schema.ts` contém tabelas Drizzle para cliente, veículo e serviço, além do schema `service_order` para OS (`orders`), itens (`supply_items`), orçamentos (`budgets`), solicitações de aprovação (`approval_requests`) e catálogo de serviços (`services`, `service_parts`, `order_services`).
- `infra/postgres/init/01-schema.sql` contém o modelo legado em `public` (incluindo `peca_insumo`, validada ao vincular peças a serviços do catálogo).

Os scripts SQL em `infra/postgres/init/` (`01-schema.sql` a `04-service-catalog-and-status.sql`) são executados automaticamente quando o volume do PostgreSQL é criado pela primeira vez. Os scripts disponíveis são:

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
```

Depois, os scripts do projeto são:

```bash
npm run dev          # desenvolvimento; executa src/index.ts em watch
npm run build        # compila para dist/
npm start            # executa dist/index.js
```

O bootstrap HTTP existente é `src/index.ts`. A aplicação usa `HOST=0.0.0.0` e `PORT=3000` por padrão, podendo receber essas variáveis pelo ambiente, além de executar periodicamente `expirePending` para expirar solicitações de aprovação vencidas.

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

| Método | Rota                                                       | Finalidade                                                        | Autenticação |
| ------ | ---------------------------------------------------------- | ----------------------------------------------------------------- | ------------ |
| `GET`  | `/health`                                                  | Verifica a aplicação e executa `SELECT 1` no banco                | Não          |
| `POST` | `/customers`                                               | Cadastra cliente                                                  | Não          |
| `GET`  | `/customers/:cpfCnpj`                                      | Consulta cliente por CPF/CNPJ                                     | Não          |
| `POST` | `/vehicles`                                                | Cadastra veículo vinculado a cliente                              | Não          |
| `GET`  | `/vehicles/:plate`                                         | Consulta veículo por placa                                        | Não          |
| `POST` | `/services`                                                | Cadastra serviço no catálogo (validando `partIds` no banco)       | Não          |
| `GET`  | `/services`                                                | Lista serviços do catálogo                                        | Não          |
| `POST` | `/service-orders`                                          | Cadastra OS (`description`, `vehicleId`)                          | Não          |
| `GET`  | `/service-orders/:serviceOrderId`                          | Consulta OS e serviços associados                                 | Não          |
| `POST` | `/service-orders/:serviceOrderId/services`                 | Associa serviço do catálogo à OS (`serviceId`)                    | Não          |
| `POST` | `/service-orders/:serviceOrderId/supplies`                 | Inclui insumo (`partCode`, `quantity`)                            | Não          |
| `POST` | `/service-orders/:serviceOrderId/supplies/:partCode/usage` | Registra uso do insumo                                            | Não          |
| `POST` | `/service-orders/:serviceOrderId/awaiting-approval`        | Calcula orçamento a partir dos serviços e envia link de aprovação | Não          |
| `POST` | `/service-orders/:serviceOrderId/start`                    | Inicia execução da OS (`IN_PROGRESS`)                             | Não          |
| `POST` | `/service-orders/:serviceOrderId/finish`                   | Finaliza execução da OS (`COMPLETED`) e notifica cliente          | Não          |
| `POST` | `/service-orders/:serviceOrderId/deliver`                  | Registra entrega do veículo (`DELIVERED`)                         | Não          |
| `POST` | `/service-orders/:serviceOrderId/cancel`                   | Cancela OS                                                        | Não          |
| `POST` | `/budget-approvals/decide`                                 | Confirma aprovação ou recusa do orçamento por token               | Não          |
| `GET`  | `/orcamento/:token` e `/orcamento`                         | Página web de aprovação/recusa do orçamento                       | Não          |
| `GET`  | `/docs`                                                    | Interface Swagger UI                                              | Não          |

A validação de payload usa Zod; erros de validação retornam HTTP 400 e exceções de aplicação/domínio são convertidas pelo error handler central em `src/app.ts`.

Os controllers de OS usam `DrizzleServiceOrderRepository`, `DrizzleBudgetRepository`, `DrizzleServiceCatalog`, `DrizzleApprovalRequestRepository` e a mesma instância de `InMemoryEventBus` usada no cadastro. A OS guarda `vehicleId`; `RegistryVehicleContactLookup` valida a existência do veículo e consulta o contato do cliente. Ao acionar `POST /service-orders/:serviceOrderId/awaiting-approval`, o orçamento é calculado somando os serviços atribuídos à OS, persistido como `PENDING` e o evento `service-order.awaiting-approval` emite um token de uso único por e-mail. Somente o hash SHA-256 é persistido em `service_order.approval_requests`. A decisão é confirmada via `POST /budget-approvals/decide` (`approved` ou `rejected`), atualizando orçamento e OS. Ao finalizar a OS (`POST /service-orders/:serviceOrderId/finish`), o evento `service-order.finished` envia o e-mail informando que o veículo está pronto para retirada. Conflitos de versão retornam HTTP 409.

Exemplo de cadastro de OS:

```bash
curl -X POST http://localhost:3000/service-orders \
  -H 'Content-Type: application/json' \
  -d '{"description":"Troca de pastilhas de freio","vehicleId":"ID_DO_VEICULO"}'
```

Não foi identificado mecanismo JWT, autorização por perfil ou proteção específica para dados sensíveis.

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

- **75 arquivos de teste passaram**.
- **672 testes passaram**.
- Cobertura V8 observada: **98,34% statements**, **91,09% branches**, **98,78% functions** e **98,03% lines**.
- `typecheck`, `lint`, `format:check` e `build` concluíram sem erros.

Os testes incluem testes unitários de domínio/aplicação, testes de repositórios Drizzle, testes de rotas HTTP via `app.inject` e o teste de integração ponta a ponta (`src/service-order/infra/http/service-order-real.integration.spec.ts`) validado contra PostgreSQL e MailHog reais.

## Estrutura relevante

```text
src/
├── app.ts                         # Fastify, Swagger, health check e erros
├── index.ts                       # bootstrap da aplicação
├── composition-root.ts            # composição dos módulos e Event Bus
├── shared/                        # abstrações comuns
├── registry/                      # clientes e veículos
├── service-order/                 # OS, orçamento, catálogo, aprovação e eventos
├── stock/                         # estoque, reservas e handlers
└── infra/database/                # conexão, schema e repositórios Drizzle

infra/
├── postgres/                      # Compose (PostgreSQL + MailHog), .env.example e scripts SQL
└── sonarqube/                     # Compose do SonarQube

docs/adr/                          # decisões arquiteturais
```

## Decisões e limitações conhecidas

- O Event Bus é in-process/in-memory; não há durabilidade, retry automático, DLQ ou replay.
- A consistência entre contextos é eventual e os handlers são preparados para idempotência em cenários específicos.
- A API HTTP cobre cadastro de clientes/veículos, catálogo de serviços, ciclo completo da OS (criação, associação de serviços, insumos, envio de orçamento para aprovação, decisão de aprovação/recusa por token, início, finalização, entrega e cancelamento) e health check.
- Não foram encontrados endpoints de atualização/exclusão, autenticação JWT ou autorização por perfil.
- Não há Dockerfile da API nem Compose completo da aplicação.

## Links e informações da entrega

- Repositório: **[PREENCHER: inserir URL pública do repositório]**
- Vídeo de apresentação: **[PREENCHER: inserir link público do YouTube]**
- Documentação DDD: **[PREENCHER: inserir link público ou manter os caminhos locais acima]**
- Grupo: **[PREENCHER]**
- Integrantes e RMs: **[PREENCHER]**
- Usuário do Discord: **[PREENCHER]**
- Branch entregue: `main`
- Commit analisado: `d7d724a`
- Versão da entrega: **[PREENCHER]**

## Status da documentação

README elaborado a partir da árvore do repositório, `package.json`, configurações TypeScript/Drizzle, código de domínio/aplicação, rotas, testes, Docker e documentação existente. Os placeholders devem ser preenchidos manualmente antes da entrega acadêmica final.
