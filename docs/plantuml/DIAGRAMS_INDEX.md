# Índice dos Diagramas PlantUML

## Visão geral

Os diagramas documentam a arquitetura atualmente implementada na branch `feat/service-order-integration`.

| Arquivo                              | Escopo                                                                                  |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| `c4-context.puml`                    | API Fastify, consumidor HTTP e PostgreSQL                                               |
| `c4-containers.puml`                 | Camadas e módulos do monolito                                                           |
| `c4-components.puml`                 | Visão geral dos componentes do monolito                                                 |
| `c4-service-order-context.puml`      | C1 focado em Service Order (Operador, Cliente e Servidor SMTP)                          |
| `c4-service-order-containers.puml`   | C2 focado em Service Order (API HTTP + Página de Orçamento, PostgreSQL e SMTP)          |
| `c4-service-order-components.puml`   | C3 focado em Service Order (14 rotas, casos de uso, handlers, portas e adaptadores)     |
| `c4-service-order-code.puml`         | C4 focado no domínio de Service Order (`ServiceOrder`, `Budget`, `ApprovalRequest`, VOs)|
| `database-er.puml`                   | Tabelas do schema Drizzle (`public` e `service_order`)                                  |
| `deployment.puml`                    | Processo Node.js e PostgreSQL provisionado separadamente                                |
| `flows/client-registration.puml`     | `POST /customers`                                                                       |
| `flows/auth-service.puml`            | Pré-cadastro de usuários e login no controller Auth                                     |
| `flows/service-order.puml`           | Solicitação de aprovação de orçamento por e-mail/token e decisão (`DecideBudgetApproval`)|
| `flows/states.puml`                  | Estados de OS (`ServiceOrder`), orçamento (`Budget`), reserva e estoque                 |

## Estado documentado

A API publicada registra Registry, Auth, Service Order, Swagger e health check. Service Order possui persistência PostgreSQL/Drizzle completa no schema `service_order`, catálogo de serviços, envio de e-mails via SMTP (`Nodemailer`), aprovação de orçamento por link/token com expiração automática, histórico de status com rastreamento do ator (`changed_by`) e rotas protegidas por JWT e permissões RBAC.

## Fonte de verdade

Ao revisar os diagramas de Service Order, compare-os com:

- `src/app.ts` e `src/index.ts`
- `src/service-order/composition-root.ts`
- `src/service-order/infra/http/service-order-routes.ts`
- `src/infra/database/schema.ts`
- `src/infra/database/service-order/*`
- `src/service-order/domain/*` e `src/service-order/application/*`
