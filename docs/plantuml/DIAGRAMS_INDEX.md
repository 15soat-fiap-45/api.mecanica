# Índice dos Diagramas PlantUML

## Visão geral

Os diagramas documentam a arquitetura atualmente implementada na branch `feat/registry-customer-vehicle-crud`.

| Arquivo                            | Escopo                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `c4-context.puml`                  | API Fastify, consumidor HTTP e PostgreSQL                                                  |
| `c4-containers.puml`               | Camadas e módulos do monolito                                                              |
| `c4-components.puml`               | Visão geral dos componentes do monolito                                                    |
| `c4-service-order-context.puml`    | C1 focado em Service Order (Operador, Cliente e Servidor SMTP)                             |
| `c4-service-order-containers.puml` | C2 focado em Service Order (API HTTP + Página de Orçamento, PostgreSQL e SMTP)             |
| `c4-service-order-components.puml` | C3 focado em Service Order (13 rotas: 10 autenticadas e 3 públicas, casos de uso, handlers, portas e adaptadores) |
| `c4-service-order-code.puml`       | C4 focado no domínio de Service Order (`ServiceOrder`, `Budget`, `ApprovalRequest`, VOs)   |
| `c4-bi-components.puml`            | C3 focado em Business Intelligence (rotas /bi/*, use cases, handlers, projeções e Drizzle) |
| `database-er.puml`                 | Tabelas do schema Drizzle (`public`, `service_order` e `business_intelligence`)            |
| `deployment.puml`                  | Processo Node.js e PostgreSQL provisionado separadamente                                   |
| `flows/client-registration.puml`   | `POST /customers` com JWT e permissão `CLIENTE_EDITAR`                                    |
| `flows/auth-service.puml`          | Pré-cadastro de usuários e login no controller Auth                                        |
| `flows/service-order.puml`         | Solicitação de aprovação de orçamento por e-mail/token e decisão (`DecideBudgetApproval`)  |
| `flows/bi-metrics.puml`            | Projeções de timeline/estoque e consulta de métricas por gerente (`/bi/*`)                 |
| `flows/states.puml`                | Estados de OS (`ServiceOrder`), orçamento (`Budget`), reserva e estoque                    |

## Estado documentado

A API publicada registra Registry, Auth, Service Order, Business Intelligence, Swagger e health check.

- **Registry:** CRUD de clientes e veículos protegido por JWT/RBAC; clientes só alteram e-mail/telefone e veículos só alteram cor; exclusão de cliente com veículos vinculados retorna conflito.
- **Auth:** primeiro acesso, login JWT e pré-cadastro de usuários restrito a gerente.
- **Service Order:** persistência PostgreSQL/Drizzle no schema `service_order`, catálogo de serviços, envio de e-mails via SMTP (`Nodemailer`), aprovação de orçamento por link/token com expiração automática, histórico de status com rastreamento do ator (`changed_by`) e rotas protegidas por JWT e RBAC.
- **Business Intelligence:** projeções de leitura orientadas a eventos no schema `business_intelligence` (`service_order_timeline` e `restock_cycle`), métricas de lead time de O.S. (total, execução e entrega) e tempo médio de reposição de estoque, com endpoints protegidos pela permissão `BI_VISUALIZAR`.

## Fonte de verdade

Ao revisar os diagramas, compare-os com:

- `src/app.ts` e `src/index.ts`
- `src/service-order/composition-root.ts` e `src/service-order/infra/http/service-order-routes.ts`
- `src/business-intelligence/composition-root.ts` e `src/business-intelligence/infra/http/bi-routes.ts`
- `src/infra/database/schema.ts`
- `src/infra/database/service-order/*` e `src/infra/database/business-intelligence/*`
- `docs/business-intelligence.md` e `docs/adr/business-intelligence-projections.md`
