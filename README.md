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

| Capacidade                                            | Estado                                           | Evidência / observação                                                                                                             |
| ----------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Cadastrar cliente                                     | **Implementado, mas não validado via banco**     | `src/registry/application/use-cases/register-customer.ts` e rota `POST /customers`                                                 |
| Consultar cliente por CPF/CNPJ                        | **Implementado, mas não validado via banco**     | `find-customer-by-document.ts` e `GET /customers/:cpfCnpj`                                                                         |
| Cadastrar veículo                                     | **Implementado, mas não validado via banco**     | `register-vehicle.ts` e `POST /vehicles`                                                                                           |
| Consultar veículo por placa                           | **Implementado, mas não validado via banco**     | `find-vehicle-by-plate.ts` e `GET /vehicles/:plate`                                                                                |
| Validação de CPF/CNPJ, e-mail, telefone e placa       | **Implementado**                                 | Value objects em `src/registry/domain/**/value-objects`                                                                            |
| Ordens de serviço no domínio                          | **Implementado para os casos de uso existentes** | Repositório Drizzle e rotas de cadastro, inclusão/uso de insumos e cancelamento; persistência real ainda não validada              |
| Orçamento e aprovação/rejeição                        | **Parcialmente implementado**                    | Repositório Drizzle e rota de aprovação com evento que aprova a OS; criação e rejeição ainda não têm caso de uso HTTP              |
| Estoque e reservas                                    | **Parcialmente implementado**                    | Agregados, casos de uso, handlers e testes existem; não há endpoints nem repositórios PostgreSQL correspondentes                   |
| CRUD completo de clientes, veículos, serviços e peças | **Pendente / parcial**                           | Foram encontradas operações de criação e consulta de clientes/veículos; atualização e exclusão não estão expostas nas rotas atuais |
| Autenticação JWT e autorização administrativa         | **Pendente**                                     | Nenhum plugin, middleware ou caso de uso JWT identificado                                                                          |
| Dockerfile da aplicação e Docker Compose completo     | **Pendente**                                     | Existe Compose para PostgreSQL e SonarQube, mas não para a aplicação                                                               |

## Arquitetura e DDD

A solução é um monólito modular organizado em camadas:

- `domain/`: entidades/agregados, objetos de valor, eventos e contratos de repositório.
- `application/use-cases/`: orquestração dos casos de uso.
- `application/handlers/`: consumidores e políticas acionadas por eventos.
- `infra/`: adaptadores HTTP e persistência.
- `shared/`: abstrações compartilhadas, exceções, IDs, eventos e Event Bus.

Os agregados e conceitos identificados incluem `Customer`, `Vehicle`, `ServiceOrder`, `Budget`, `PartSupply`, `SupplyReservation` e `User`. Entre os objetos de valor estão `CpfCnpj`, `Email`, `Telephone`, `Plate`, `Quantity`, `UnitOfMeasure`, `PartCode`, `Role` e objetos de status.

Os módulos se comunicam por um `InMemoryEventBus`, implementado em `src/shared/application/in-memory-event-bus.ts`. A decisão está registrada em [`docs/adr/event-bus.md`](docs/adr/event-bus.md). O desenho atual assume consistência eventual entre contextos, com handlers para reservar, liberar, consumir e baixar insumos.

### Status de ordem de serviço

O domínio usa os valores em inglês `PENDING`, `APPROVED`, `IN_PROGRESS`, `PAUSED`, `COMPLETED` e `CANCELLED`, com transições definidas em `src/service-order/domain/service-order/value-objects/service-order-status.ts`:

```text
PENDING      -> APPROVED | CANCELLED
APPROVED     -> IN_PROGRESS | CANCELLED
IN_PROGRESS  -> PAUSED | COMPLETED | CANCELLED
PAUSED       -> IN_PROGRESS | CANCELLED
COMPLETED    -> (final)
CANCELLED    -> (final)
```

Isso diverge dos status acadêmicos em português (`RECEBIDA`, `EM_DIAGNOSTICO`, `AGUARDANDO_APROVACAO`, `EM_EXECUCAO`, `FINALIZADA`, `ENTREGUE`). A equivalência e a implementação do fluxo completo ainda precisam ser definidas.

### Documentação DDD

- ADR do Event Bus: [`docs/adr/event-bus.md`](docs/adr/event-bus.md)
- Fluxos Auth: [`docs/plantuml/flows/auth-service.puml`](docs/plantuml/flows/auth-service.puml)
- Event Storming: **[PREENCHER: inserir link ou caminho do artefato]**
- Diagrama de domínio / linguagem ubíqua / glossário: **[PREENCHER: inserir link ou caminho]**

## Tecnologias

- Node.js e TypeScript ESM (`module: nodenext`), modo estrito.
- Fastify 5, Zod e `fastify-type-provider-zod`.
- Drizzle ORM, `drizzle-kit` e `pg`.
- PostgreSQL 17 no ambiente Docker do banco.
- Argon2id para senhas, `jose` para JWT e `@fastify/rate-limit` para limitar tentativas de autenticação.
- Vitest 5 para testes.
- ESLint, Prettier e configuração opcional de SonarQube.

## Pré-requisitos

- Node.js compatível com TypeScript 6 e as dependências do `package.json`.
- npm.
- Docker e Docker Compose para executar o PostgreSQL.

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
DATABASE_URL=<opcional; tem prioridade sobre as variáveis individuais>
INITIAL_MANAGER_PASSWORD=<senha temporária do gerente inicial; obrigatória>
JWT_SECRET=<chave de assinatura JWT; obrigatória, com pelo menos 32 bytes>
```

As duas últimas variáveis são usadas pelo bootstrap da aplicação; podem ser definidas no ambiente do processo. `src/infra/database/connection.ts` também carrega `infra/postgres/.env` no desenvolvimento. O arquivo `.env` real não deve ser publicado; não use os valores de exemplo como senhas reais.

## Banco de dados

O banco identificado no projeto é o **PostgreSQL**. A escolha está refletida em `pg`, `drizzle-orm/node-postgres`, `drizzle.config.ts`, `infra/postgres/docker-compose.yml` e no schema SQL inicial. O README do banco também registra a justificativa operacional para uso de PostgreSQL com Docker e Drizzle.

Há duas representações que ainda precisam ser alinhadas:

- `src/infra/database/schema.ts` contém tabelas Drizzle para cliente, veículo e serviço, além do schema `service_order` para OS, itens e orçamento.
- `infra/postgres/init/01-schema.sql` contém um modelo mais amplo, incluindo peças, usuários, ordens, orçamento, estoque e histórico de status.

O script SQL inicial é executado automaticamente apenas quando o volume do PostgreSQL é criado pela primeira vez. Os scripts disponíveis são:

```bash
npm run db:generate
npm run db:migrate
npm run db:push
npm run db:studio
npm run db:test
```

Os repositórios Drizzle de OS e orçamento implementam os contratos existentes, com controle otimista de versão. A OS e seus itens são persistidos em uma transação. O script incremental `infra/postgres/init/02-service-order.sql` provisiona o schema do contexto sem alterar o modelo legado em `public`. Para um volume existente, aplique esse script conforme o [README do PostgreSQL](infra/postgres/README.md). Os repositórios de estoque ainda são contratos de domínio; não há diretório de migrações gerenciadas pelo Drizzle.

## Execução local

Inicie o banco:

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

O bootstrap HTTP existente é `src/index.ts`. A aplicação usa `HOST=0.0.0.0` e `PORT=3000` por padrão, podendo receber essas variáveis pelo ambiente. A inicialização depende de uma conexão PostgreSQL válida, de `INITIAL_MANAGER_PASSWORD` não vazia e de `JWT_SECRET` com pelo menos 32 bytes; sem essas variáveis, ela falha antes de abrir a porta.

### Fluxo de autenticação

Para instruções de uso e permissões por papel, consulte o [guia de autenticação e autorização](docs/authorization.md).

Na primeira execução com `auth_users` vazia, o bootstrap cria `admin@admin.com` como `GERENTE` em estado `PENDING_FIRST_ACCESS`, com a senha temporária definida em `INITIAL_MANAGER_PASSWORD` armazenada como hash Argon2id. O seed não redefine a senha em reinicializações nem cria outro gerente caso já existam usuários.

1. Envie `POST /auth/first-access` com `{"email":"admin@admin.com","temporaryPassword":"<senha temporária>","newPassword":"<nova senha>"}`. A nova senha deve ser diferente, ter pelo menos 8 caracteres e conter somente letras e números. Sucesso: `204`.
2. Envie `POST /auth/login` com `{"email":"admin@admin.com","password":"<nova senha>"}`. Um usuário `ACTIVE` recebe `{"token":"<jwt>"}`; o token HS256 expira em 4 horas. Usuários pendentes devem concluir o primeiro acesso antes de fazer login.
3. Com o token do gerente, envie `POST /users` com `Authorization: Bearer <jwt>` e `{"email":"pessoa@example.com","role":"ATENDENTE"}`. Sucesso: `201` com `{"temporaryPassword":"<senha gerada>"}`. Entregue essa senha ao usuário por canal seguro: ela é retornada em claro nessa única resposta e o novo usuário também deverá fazer primeiro acesso.

Papéis aceitos: `ATENDENTE`, `MECANICO`, `ESTOQUISTA` e `GERENTE`. Apenas o gerente ativo tem permissão para pré-cadastrar usuários. O controller consulta o usuário no banco a cada requisição autenticada, para que desativação ou mudança de papel não espere o JWT expirar. Login e primeiro acesso têm limite de **5 requisições por minuto por IP e por rota** (`429` ao exceder), armazenado na memória do processo; múltiplas instâncias exigiriam um armazenamento compartilhado. Use HTTPS ao expor senhas e tokens.

## Docker

O Compose disponível em [`infra/postgres/docker-compose.yml`](infra/postgres/docker-compose.yml) provisiona somente o serviço `postgres`, exposto na porta definida por `POSTGRES_PORT` e internamente na porta 5432.

```bash
cd infra/postgres
docker compose up -d
docker compose ps
docker compose logs -f postgres
docker compose down
```

Não existe `Dockerfile` da aplicação nem `docker-compose.yml` na raiz orquestrando API e banco. Portanto, o requisito acadêmico de empacotamento completo da aplicação com Docker está pendente. O Compose de SonarQube está em [`infra/sonarqube/docker-compose.yml`](infra/sonarqube/docker-compose.yml).

## API HTTP

O Fastify registra Swagger e Swagger UI em `/docs`. A especificação OpenAPI é gerada a partir das rotas registradas.

| Método | Rota                                                       | Finalidade                                         | Autenticação |
| ------ | ---------------------------------------------------------- | -------------------------------------------------- | ------------ |
| `GET`  | `/health`                                                  | Verifica a aplicação e executa `SELECT 1` no banco | Não          |
| `POST` | `/customers`                                               | Cadastra cliente                                   | Não          |
| `GET`  | `/customers/:cpfCnpj`                                      | Consulta cliente por CPF/CNPJ                      | Não          |
| `POST` | `/vehicles`                                                | Cadastra veículo vinculado a cliente               | Não          |
| `GET`  | `/vehicles/:plate`                                         | Consulta veículo por placa                         | Não          |
| `POST` | `/service-orders`                                          | Cadastra OS (`description`)                        | Não          |
| `POST` | `/service-orders/:serviceOrderId/supplies`                 | Inclui insumo (`partCode`, `quantity`)             | Não          |
| `POST` | `/service-orders/:serviceOrderId/supplies/:partCode/usage` | Registra uso do insumo                             | Não          |
| `POST` | `/service-orders/:serviceOrderId/cancel`                   | Cancela OS                                         | Não          |
| `POST` | `/budgets/:budgetId/approve`                               | Aprova orçamento existente                         | Não          |
| `GET`  | `/docs`                                                    | Interface Swagger UI                               | Não          |

As rotas de serviços, peças, estoque, usuários e autenticação ainda não estão registradas em adaptadores HTTP identificáveis. A validação de payload usa Zod; erros de validação retornam HTTP 400 e exceções de aplicação/domínio são convertidas pelo error handler central em `src/app.ts`.

Os controllers de OS delegam aos cinco casos de uso existentes, compostos com
`DrizzleServiceOrderRepository`, `DrizzleBudgetRepository` e a mesma instância de
`InMemoryEventBus` usada no cadastro. Os eventos `service-order.registered`,
`service-order.additional-supplies-included`, `service-order.supply-used`,
`service-order.cancelled` e `service-order.budget-approved` são publicados após
persistência. O handler de aprovação do orçamento altera a OS para `APPROVED`.
Conflitos de versão retornam HTTP 409.

O orçamento precisa existir antes da aprovação: o projeto ainda não tem caso de
uso para criá-lo por HTTP. Também não há caso de uso HTTP para iniciar/finalizar
OS. O composition root geral mantém as assinaturas dos handlers de estoque,
mas a inicialização atual sobe cadastro e OS; o consumo pelo estoque depende da
integração desse contexto com repositórios concretos.

Exemplo de cadastro de OS:

```bash
curl -X POST http://localhost:3000/service-orders \
  -H 'Content-Type: application/json' \
  -d '{"description":"Troca de pastilhas de freio"}'
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

Na verificação desta branch, `npm test` passou com **54 arquivos e 415 testes**; `npm run typecheck` e `npm run build` também passaram. A cobertura V8 da versão atual não foi medida; os percentuais anteriores não devem ser usados como resultado desta branch.

Os testes existentes são predominantemente unitários, com doubles/fakes de repositório e testes de rotas usando `app.inject`. O teste em `src/app.spec.ts` percorre primeiro acesso, login e pré-cadastro no Fastify montado, mas usa um repositório em memória. Não foi comprovada uma suíte de integração contra PostgreSQL nem a cobertura isolada dos “domínios críticos” conforme o critério acadêmico; esse recorte deve ser validado na entrega.

## Estrutura relevante

```text
src/
├── app.ts                         # Fastify, Swagger, health check e erros
├── index.ts                       # bootstrap da aplicação
├── composition-root.ts            # composição dos módulos e Event Bus
├── auth/                          # usuários, autenticação, autorização e adaptadores
├── shared/                        # abstrações comuns
├── registry/                      # clientes e veículos
├── service-order/                 # OS, orçamento e eventos
├── stock/                         # estoque, reservas e handlers
└── infra/database/                # conexão, schema e repositórios Drizzle

infra/
├── postgres/                      # Compose, .env.example e schema SQL inicial
└── sonarqube/                     # Compose do SonarQube

docs/adr/                          # decisões arquiteturais
docs/plantuml/flows/auth-service.puml  # sequência de pré-cadastro e login
drizzle/                           # migrações versionadas de auth_users
```

## Decisões e limitações conhecidas

- O Event Bus é in-process/in-memory; não há durabilidade, retry, DLQ ou replay.
- A consistência entre contextos é eventual e os handlers são preparados para idempotência em cenários específicos.
- A API HTTP cobre cadastro, os cinco casos de uso existentes de OS/orçamento e health check; faltam criação de orçamento e início/finalização de OS.
- O modelo SQL inicial e o schema Drizzle ainda não representam o mesmo conjunto de tabelas.
- Não foram encontrados endpoints de atualização/exclusão, autenticação JWT, autorização ou fluxo público de criação/rejeição de orçamento.
- Não há Dockerfile da API nem Compose completo da aplicação.

## Links e informações da entrega

- Repositório: **[PREENCHER: inserir URL pública do repositório]**
- Vídeo de apresentação: **[PREENCHER: inserir link público do YouTube]**
- Documentação DDD: **[PREENCHER: inserir link público ou manter os caminhos locais acima]**
- Grupo: **[PREENCHER]**
- Integrantes e RMs: **[PREENCHER]**
- Usuário do Discord: **[PREENCHER]**
- Branch entregue: `main`
- Commit analisado: **[PREENCHER: registrar o commit da entrega]**
- Versão da entrega: **[PREENCHER]**

## Status da documentação

README elaborado a partir da árvore do repositório, `package.json`, configurações TypeScript/Drizzle, código de domínio/aplicação, rotas, testes, Docker e documentação existente. Os placeholders devem ser preenchidos manualmente antes da entrega acadêmica final.
