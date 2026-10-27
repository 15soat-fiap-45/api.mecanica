# Diagramas PlantUML - API Oficina Mecanica

Os diagramas desta pasta descrevem o estado confirmado no código atual. A implementação é um monolito modular em TypeScript, com Fastify, Zod, Drizzle ORM, PostgreSQL, Nodemailer (SMTP) e Event Bus em memória.

## Arquivos

- `c4-context.puml` e `c4-service-order-context.puml`: contexto da API e integrações (PostgreSQL e SMTP).
- `c4-containers.puml` e `c4-service-order-containers.puml`: processo Fastify, aplicação, domínio, Event Bus, SMTP e persistência.
- `c4-components.puml` e `c4-service-order-components.puml`: componentes efetivamente usados pelo bootstrap HTTP.
- `c4-service-order-code.puml`: agregados, entidades, value objects e contratos de repositório de `service-order`.
- `database-er.puml`: tabelas do schema Drizzle atual (`public` e `service_order`).
- `deployment.puml`: execução atual com processo Node.js e PostgreSQL.
- `flows/client-registration.puml`: fluxo real de `POST /customers`.
- `flows/auth-service.puml`: pré-cadastro e login registrados pelo controller Auth.
- `flows/service-order.puml`: fluxo de solicitação de aprovação de orçamento por e-mail/token e decisão pelo cliente.
- `flows/states.puml`: estados implementados para OS, orçamento, reserva e estoque.

## Rotas de Service Order

- Autenticadas via Bearer JWT + RBAC (`TokenActorResolver`):
  - `POST /service-orders` (`OS_CRIAR`)
  - `POST /services` (`OS_CRIAR`)
  - `GET /services` (autenticado)
  - `POST /service-orders/:serviceOrderId/services` (`OS_CONCLUIR`)
  - `GET /service-orders/:serviceOrderId` (autenticado)
  - `GET /service-orders/:serviceOrderId/history` (autenticado)
  - `POST /service-orders/:serviceOrderId/supplies` (`ESTOQUE_BAIXAR`)
  - `POST /service-orders/:serviceOrderId/supplies/:partCode/usage` (`ESTOQUE_BAIXAR`)
  - `POST /service-orders/:serviceOrderId/cancel` (`OS_CRIAR`)
  - `POST /service-orders/:serviceOrderId/awaiting-approval` (`OS_CONCLUIR`)
  - `POST /service-orders/:serviceOrderId/start` (`OS_CONCLUIR`)
  - `POST /service-orders/:serviceOrderId/finish` (`OS_CONCLUIR`)
  - `POST /service-orders/:serviceOrderId/deliver` (`OS_CRIAR`)
- Públicas (fluxo de aprovação do cliente):
  - `POST /budget-approvals/decide`
  - `GET /orcamento/:token` e `GET /orcamento`

## Banco

`src/infra/database/schema.ts` mapeia no schema `public` (`auth_users`, `cliente`, `veiculo`, `servico`) e no schema `service_order` (`orders`, `supply_items`, `budgets`, `approval_requests`, `services`, `service_parts`, `order_services`, `order_status_history`).

## Validação

Para visualizar, use a extensão PlantUML do VS Code ou a CLI PlantUML. Os includes C4 apontam para o repositório oficial do C4-PlantUML.
