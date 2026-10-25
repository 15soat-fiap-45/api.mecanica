# Índice dos Diagramas PlantUML

## Visão geral

Os diagramas documentam a arquitetura atualmente implementada, não uma arquitetura futura.

| Arquivo                          | Escopo                                                     |
| -------------------------------- | ---------------------------------------------------------- |
| `c4-context.puml`                | API Fastify, consumidor HTTP e PostgreSQL                  |
| `c4-containers.puml`             | Camadas e módulos do monolito                              |
| `c4-components.puml`             | Rotas Registry, casos de uso, domínio, Drizzle e Event Bus |
| `database-er.puml`               | `cliente`, `veiculo` e `servico` do schema Drizzle         |
| `deployment.puml`                | Processo Node.js e PostgreSQL provisionado separadamente   |
| `flows/client-registration.puml` | `POST /customers`                                          |
| `flows/auth-service.puml`        | Pré-cadastro de usuários e login no controller Auth        |
| `flows/service-order.puml`       | Integração interna de Service Order e Stock                |
| `flows/states.puml`              | Estados de OS, orçamento, reserva e estoque                |

## Estado documentado

A API publicada registra Registry, Auth, Swagger e health check. Clientes, veículos e usuários usam repositórios Drizzle concretos. Service Order e Stock têm agregados, casos de uso e handlers conectados pelo `InMemoryEventBus`, mas ainda não têm rotas HTTP nem persistência PostgreSQL concreta.

Integrações como Redis, S3, pagamentos, notificações e cluster de deployment não fazem parte do estado atual.

## Fonte de verdade

Ao revisar os diagramas, compare-os com:

- `src/app.ts` e `src/index.ts`
- `src/registry/infra/http/registry-routes.ts`
- `src/composition-root.ts`
- `src/infra/database/schema.ts`
- value objects de status em `src/service-order` e `src/stock`
- `infra/postgres/docker-compose.yml`
