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

| Capacidade | Estado | Evidência / observação |
|---|---|---|
| Cadastrar cliente | **Implementado, mas não validado via banco** | `src/registry/application/use-cases/register-customer.ts` e rota `POST /customers` |
| Consultar cliente por CPF/CNPJ | **Implementado, mas não validado via banco** | `find-customer-by-document.ts` e `GET /customers/:cpfCnpj` |
| Cadastrar veículo | **Implementado, mas não validado via banco** | `register-vehicle.ts` e `POST /vehicles` |
| Consultar veículo por placa | **Implementado, mas não validado via banco** | `find-vehicle-by-plate.ts` e `GET /vehicles/:plate` |
| Validação de CPF/CNPJ, e-mail, telefone e placa | **Implementado** | Value objects em `src/registry/domain/**/value-objects` |
| Ordens de serviço no domínio | **Parcialmente implementado** | Agregado, casos de uso e testes existem; não há rotas HTTP ou persistência concreta identificada para OS |
| Orçamento e aprovação/rejeição | **Parcialmente implementado** | Agregado `Budget`, casos de uso e evento de aprovação existem; não há API publicada para o fluxo |
| Estoque e reservas | **Parcialmente implementado** | Agregados, casos de uso, handlers e testes existem; não há endpoints nem repositórios PostgreSQL correspondentes |
| CRUD completo de clientes, veículos, serviços e peças | **Pendente / parcial** | Foram encontradas operações de criação e consulta de clientes/veículos; atualização e exclusão não estão expostas nas rotas atuais |
| Autenticação JWT e autorização administrativa | **Pendente** | Nenhum plugin, middleware ou caso de uso JWT identificado |
| Dockerfile da aplicação e Docker Compose completo | **Pendente** | Existe Compose para PostgreSQL e SonarQube, mas não para a aplicação |

## Arquitetura e DDD

A solução é um monólito modular organizado em camadas:

- `domain/`: entidades/agregados, objetos de valor, eventos e contratos de repositório.
- `application/use-cases/`: orquestração dos casos de uso.
- `application/handlers/`: consumidores e políticas acionadas por eventos.
- `infra/`: adaptadores HTTP e persistência.
- `shared/`: abstrações compartilhadas, exceções, IDs, eventos e Event Bus.

Os agregados e conceitos identificados incluem `Customer`, `Vehicle`, `ServiceOrder`, `Budget`, `PartSupply` e `SupplyReservation`. Entre os objetos de valor estão `CpfCnpj`, `Email`, `Telephone`, `Plate`, `Quantity`, `UnitOfMeasure`, `PartCode` e objetos de status.

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
- Event Storming: **[PREENCHER: inserir link ou caminho do artefato]**
- Diagrama de domínio / linguagem ubíqua / glossário: **[PREENCHER: inserir link ou caminho]**

## Tecnologias

- Node.js e TypeScript ESM (`module: nodenext`), modo estrito.
- Fastify 5, Zod e `fastify-type-provider-zod`.
- Drizzle ORM, `drizzle-kit` e `pg`.
- PostgreSQL 17 no ambiente Docker do banco.
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
```

O arquivo `.env` real não deve ser publicado.

## Banco de dados

O banco identificado no projeto é o **PostgreSQL**. A escolha está refletida em `pg`, `drizzle-orm/node-postgres`, `drizzle.config.ts`, `infra/postgres/docker-compose.yml` e no schema SQL inicial. O README do banco também registra a justificativa operacional para uso de PostgreSQL com Docker e Drizzle.

Há duas representações que ainda precisam ser alinhadas:

- `src/infra/database/schema.ts` contém tabelas Drizzle para cliente, veículo e serviço.
- `infra/postgres/init/01-schema.sql` contém um modelo mais amplo, incluindo peças, usuários, ordens, orçamento, estoque e histórico de status.

O script SQL inicial é executado automaticamente apenas quando o volume do PostgreSQL é criado pela primeira vez. Os scripts disponíveis são:

```bash
npm run db:generate
npm run db:migrate
npm run db:push
npm run db:studio
npm run db:test
```

Não há diretório de migrações versionadas na árvore analisada. A persistência concreta identificada está concentrada nos repositórios Drizzle de cliente e veículo; os repositórios dos contextos de ordem e estoque são apenas contratos de domínio no estado atual.

## Execução local

Inicie o banco:

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

O bootstrap HTTP existente é `src/index.ts`. A aplicação usa `HOST=0.0.0.0` e `PORT=3000` por padrão, podendo receber essas variáveis pelo ambiente. A inicialização depende de uma conexão PostgreSQL válida.

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

| Método | Rota | Finalidade | Autenticação |
|---|---|---|---|
| `GET` | `/health` | Verifica a aplicação e executa `SELECT 1` no banco | Não |
| `POST` | `/customers` | Cadastra cliente | Não |
| `GET` | `/customers/:cpfCnpj` | Consulta cliente por CPF/CNPJ | Não |
| `POST` | `/vehicles` | Cadastra veículo vinculado a cliente | Não |
| `GET` | `/vehicles/:plate` | Consulta veículo por placa | Não |
| `GET` | `/docs` | Interface Swagger UI | Não |

As rotas de ordem de serviço, orçamento, serviços, peças, estoque, usuários e autenticação ainda não estão registradas em adaptadores HTTP identificáveis. A validação de payload usa Zod; erros de validação retornam HTTP 400 e exceções de aplicação/domínio são convertidas pelo error handler central em `src/app.ts`.

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

Os testes existentes são predominantemente unitários, com doubles/fakes de repositório e testes de rotas usando `app.inject`. Não foi comprovada uma suíte de integração contra PostgreSQL nem a cobertura isolada dos “domínios críticos” conforme o critério acadêmico; esse recorte deve ser validado na entrega.

## Estrutura relevante

```text
src/
├── app.ts                         # Fastify, Swagger, health check e erros
├── index.ts                       # bootstrap da aplicação
├── composition-root.ts            # composição dos módulos e Event Bus
├── shared/                        # abstrações comuns
├── registry/                      # clientes e veículos
├── service-order/                 # OS, orçamento e eventos
├── stock/                         # estoque, reservas e handlers
└── infra/database/                # conexão, schema e repositórios Drizzle

infra/
├── postgres/                      # Compose, .env.example e schema SQL inicial
└── sonarqube/                     # Compose do SonarQube

docs/adr/                          # decisões arquiteturais
```

## Decisões e limitações conhecidas

- O Event Bus é in-process/in-memory; não há durabilidade, retry, DLQ ou replay.
- A consistência entre contextos é eventual e os handlers são preparados para idempotência em cenários específicos.
- A API HTTP cobre apenas o contexto de cadastro e health check.
- O modelo SQL inicial e o schema Drizzle ainda não representam o mesmo conjunto de tabelas.
- Não foram encontrados endpoints de atualização/exclusão, autenticação JWT, autorização ou fluxo público de aprovação/rejeição de orçamento.
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
