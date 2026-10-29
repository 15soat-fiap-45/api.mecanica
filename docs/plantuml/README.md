# Diagramas PlantUML - API Oficina Mecanica

Os diagramas desta pasta descrevem o estado confirmado no código atual. A implementação é um monolito modular em TypeScript, com Fastify, Zod, Drizzle ORM, PostgreSQL, Nodemailer (SMTP) e Event Bus em memória.

## Arquivos

- `c4-context.puml` e `c4-service-order-context.puml`: contexto da API e integrações (PostgreSQL e SMTP).
- `c4-containers.puml` e `c4-service-order-containers.puml`: processo Fastify, aplicação, domínio, Event Bus, SMTP e persistência.
- `c4-components.puml`, `c4-service-order-components.puml` e `c4-bi-components.puml`: componentes efetivamente usados pelo bootstrap HTTP.
- `c4-service-order-code.puml`: agregados, entidades, value objects e contratos de repositório de `service-order`.
- `database-er.puml`: tabelas do schema Drizzle atual (`public`, `service_order` e `business_intelligence`).
- `deployment.puml`: execução atual com processo Node.js e PostgreSQL.
- `flows/client-registration.puml`: fluxo real de `POST /customers`.
- `flows/auth-service.puml`: pré-cadastro e login registrados pelo controller Auth.
- `flows/service-order.puml`: registro/revisão da descrição durante a avaliação e solicitação de aprovação de orçamento por e-mail/token.
- `flows/bi-metrics.puml`: fluxo de projeção orientada a eventos e consulta de métricas de BI.
- `flows/states.puml`: estados implementados para OS, orçamento, reserva e estoque.

## Rotas de Service Order

- Autenticadas via Bearer JWT + RBAC (`TokenActorResolver`):
    - `POST /service-orders` (`OS_CRIAR`)
    - `GET /service-orders/:serviceOrderId` (autenticado)
    - `PATCH /service-orders/:serviceOrderId/description` (`OS_CONCLUIR`, somente `PENDING`)
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

## Rotas de Business Intelligence

- Autenticadas via Bearer JWT + RBAC (`TokenBiAccessGuard`):
    - `GET /bi/service-orders/lead-time` (`BI_VISUALIZAR` — `GERENTE`)
    - `GET /bi/stock/restock-lead-time` (`BI_VISUALIZAR` — `GERENTE`)

### Descrição da avaliação

Mecânico e gerente podem registrar e revisar `description` na própria OS durante a avaliação (`PENDING`). `UpdateServiceOrderDescription` chama `ServiceOrder.updateDescription()` e salva pelo `ServiceOrderRepository`, reutilizando `service_order.orders.description`. O texto substitui a descrição anterior, tem espaços das extremidades removidos e não pode ficar vazio. A edição isolada mantém o status e não cria uma nova entrada no histórico de fases.

`AwaitBudgetApproval` também aceita `description` opcional junto de `valueCents`; os dados da OS e o orçamento são persistidos na mesma transação antes da notificação. Omitir a descrição preserva o texto anterior. Após o envio para aprovação, a edição fica bloqueada. A descrição aparece na consulta da OS e no e-mail do orçamento; a página HTML de aprovação apenas confirma a decisão. O hash `budgetVersion` considera a descrição, o valor e os itens da OS.

## Banco

`src/infra/database/schema.ts` mapeia no schema `public` (`auth_users`, `cliente`, `veiculo`), no schema `service_order` (`orders`, `supply_items`, `budgets`, `approval_requests`, `order_status_history`) e no schema `business_intelligence` (`service_order_timeline`, `restock_cycle`).

## Validação

Para visualizar, use a extensão PlantUML do VS Code ou a CLI PlantUML. Os includes C4 apontam para o repositório oficial do C4-PlantUML.
