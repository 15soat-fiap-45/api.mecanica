# Diagramas PlantUML - API Oficina Mecanica

Os diagramas desta pasta descrevem o estado confirmado no código atual. A implementação é um monolito modular em TypeScript, com Fastify, Zod, Drizzle ORM, PostgreSQL e Event Bus em memória.

## Arquivos

- `c4-context.puml`: contexto da API e sua única integração persistente atual.
- `c4-containers.puml`: processo Fastify, aplicação, domínio, Event Bus e persistência.
- `c4-components.puml`: componentes efetivamente usados pelo bootstrap HTTP.
- `database-er.puml`: tabelas do schema Drizzle atual.
- `deployment.puml`: execução atual com processo Node.js e PostgreSQL.
- `flows/client-registration.puml`: fluxo real de `POST /customers`.
- `flows/auth-service.puml`: pré-cadastro e login registrados pelo controller Auth.
- `flows/service-order.puml`: fluxo interno de OS/estoque via eventos.
- `flows/states.puml`: estados implementados para OS, orçamento, reserva e estoque.

## Rotas atuais

- `GET /health`
- `GET /docs`
- `POST /auth/first-access`
- `POST /auth/login`
- `POST /users`
- `POST /customers`
- `GET /customers/:cpfCnpj`
- `POST /vehicles`
- `GET /vehicles/:plate`

As rotas Auth usam JWT para pré-cadastro, mas não protegem as rotas Registry. Não há Redis, S3, pagamentos, e-mail/SMS ou endpoints HTTP de ordem de serviço/estoque.

## Banco

`src/infra/database/schema.ts` mapeia `auth_users`, `cliente`, `veiculo` e `servico`. O SQL inicial em `infra/postgres/init/01-schema.sql` declara tabelas adicionais, mas elas ainda não possuem correspondência completa nos adaptadores Drizzle; por isso não são representadas como persistência ativa no ER.

## Validação

Para visualizar, use a extensão PlantUML do VS Code ou a CLI PlantUML. Os includes C4 apontam para o repositório oficial do C4-PlantUML.
