# Instruções do projeto — API Oficina Mecânica

## Visão geral

Este repositório implementa uma API HTTP para uma oficina mecânica em TypeScript, organizada como um monólito modular com princípios de DDD. Os contextos principais são:

- `auth`: primeiro acesso, login, usuários, papéis e permissões;
- `registry`: cadastro e consulta de clientes e veículos;
- `service-order`: ordens de serviço, catálogo, orçamento, aprovação, consumo de insumos e histórico;
- `stock`: peças/insumos, entradas, reservas, consumo e baixas.

A aplicação é inicializada em `src/index.ts`. O bootstrap conecta PostgreSQL/Drizzle, seed do gerente inicial, JWT, Argon2, Event Bus em memória, SMTP, casos de uso e rotas Fastify. `src/app.ts` monta a aplicação HTTP, o health check, o Swagger e o tratamento de erros.

Antes de alterar o código, leia o agregado, os value objects, a interface de repositório, os eventos e os testes do contexto afetado. Preserve as invariantes de domínio, os contratos de eventos e as dependências dos composition roots.

## Stack e comandos

- Node.js, TypeScript ESM (`module: nodenext`), modo estrito e imports relativos com `.js`.
- Fastify 5, Zod, `fastify-type-provider-zod` e Swagger/OpenAPI.
- Drizzle ORM com PostgreSQL.
- JWT HS256 com `jose`, senhas com Argon2id e rate limit de autenticação em memória.
- Nodemailer para SMTP e Event Bus síncrono em memória.
- Vitest, ESLint, Prettier e SonarQube.

```bash
npm install
npm run dev             # tsx watch src/index.ts
npm run build           # dist/index.js
npm start
npm run typecheck
npm test
npm run test:coverage
npm run lint
npm run format:check
npm run format
```

No PowerShell deste workspace, se `npm` for bloqueado pela política de execução, use `npm.cmd` com o mesmo subcomando.

## Estrutura e dependências

```text
src/
├── auth/               # autenticação, usuários, segurança e autorização
├── registry/           # clientes, veículos e value objects de cadastro
├── service-order/      # OS, orçamento, catálogo, eventos e handlers
├── stock/              # estoque, reservas e consumo
├── infra/              # banco, repositórios, resolução de ator e integrações
├── shared/             # entidades, eventos, exceções, use cases e Event Bus
├── app.ts              # composição da aplicação Fastify
├── composition-root.ts # composição ampla dos contextos
└── index.ts            # bootstrap de produção/desenvolvimento

infra/postgres/
├── docker-compose.yml  # PostgreSQL e MailHog
└── init/               # scripts SQL versionados por etapa do schema
```

Cada contexto separa `domain`, `application` e `infra`. Use interfaces como portas no domínio/aplicação; implementações Drizzle, SMTP e HTTP ficam na infraestrutura. Os composition roots (`src/registry/composition-root.ts`, `src/service-order/composition-root.ts` e `src/composition-root.ts`) são o ponto de composição.

## Regras arquiteturais

1. Agregados protegem invariantes. Alterações de estado devem passar por métodos do agregado, nunca por mutação direta de estado privado.
2. Value objects validam entradas e normalizam valores. Reutilize `Email`, `CpfCnpj`, `Telephone`, `Plate`, `Quantity`, `PartCode`, status e demais objetos existentes.
3. Casos de uso orquestram carregamento, regras do agregado, persistência e publicação dos eventos pendentes.
4. Handlers devem ser finos e idempotentes quando processam eventos de outro contexto.
5. Use o `EventBus` para integração entre contextos. Não importe agregados ou casos de uso de outro contexto para acoplá-los diretamente.
6. Eventos são contratos: preserve `eventName`, `aggregateId`, `eventId`, `occurredOn` e o payload consumido. Atualize consumidores e testes quando o contrato mudar.
7. Consistência entre contextos é eventual. Uma transação local por handler é esperada; não introduza uma transação distribuída sem decisão arquitetural explícita.
8. Preserve `AggregateRoot.version` e a verificação de versão dos repositórios para concorrência otimista.
9. Não replique regras de autorização em rotas: use `TokenActorResolver`/política de acesso e as permissões existentes.

## HTTP, autenticação e fluxos relevantes

- `GET /health` verifica a conexão com o PostgreSQL.
- `GET /docs` e `GET /docs/json` expõem Swagger/OpenAPI.
- `/auth/login`, `/auth/first-access` e `/users` cuidam do ciclo de usuários; login e primeiro acesso têm limite de 5 requisições por minuto por IP e rota.
- O seed cria `admin@admin.com` como gerente pendente quando necessário. `INITIAL_MANAGER_PASSWORD` é obrigatória no bootstrap e não deve ser versionada.
- O JWT não carrega o papel como fonte de verdade: cada requisição autenticada resolve o usuário novamente no banco, permitindo que desativação ou mudança de papel tenha efeito imediato.
- Rotas de OS e catálogo exigem Bearer JWT e permissões RBAC; ausência/invalidez gera `401` e falta de permissão gera `403`.
- O fluxo de orçamento gera aprovação tokenizada, envia e-mail, permite decisão do cliente e possui expiração periódica de pendências em `src/index.ts`.
- Ao concluir uma OS, eventos acionam baixa de reservas e notificação de veículo pronto; ao cancelar, reservas são liberadas.

Rotas e exemplos de uso estão documentados no `README.md`, em `docs/authorization.md` e nos testes de `src/*/infra/http`.

## Banco e ambiente

O banco local é provisionado por `infra/postgres/docker-compose.yml`, que também sobe o MailHog. Os scripts SQL em `infra/postgres/init` são executados automaticamente apenas na primeira criação do volume. Para alterações posteriores, use migrações Drizzle (`db:generate`, `db:migrate`, `db:push`) e atualize o schema com cuidado.

Variáveis necessárias ou relevantes:

- `DATABASE_URL` ou `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` e opcionalmente `POSTGRES_PORT`;
- `INITIAL_MANAGER_PASSWORD` e `JWT_SECRET` (segredo JWT com pelo menos 32 bytes);
- `HOST` e `PORT` (padrões `0.0.0.0` e `3000`);
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `FRONTEND_URL` e `APPROVAL_TOKEN_TTL_MINUTES`;
- opcionais de SMTP: `SMTP_USER`, `SMTP_PASS` e `SMTP_SECURE`.

Nunca versione `.env`, credenciais, tokens ou dados gerados. Não há `Dockerfile` da aplicação nem Compose na raiz; o Compose disponível é o de PostgreSQL/MailHog, além do Compose separado de SonarQube.

## Testes e qualidade

Os testes unitários e de integração HTTP ficam próximos ao código em `*.spec.ts`. Prefira fakes das portas para regras de domínio e cubra caminho feliz, transições inválidas, limites, erros, eventos, idempotência e autorização. A integração real de PostgreSQL/SMTP é condicional e fica em `service-order-real.integration.spec.ts`.

Na análise deste workspace, após atualizar as dependências:

- `npm.cmd run lint`: passou;
- `npm.cmd test`: 477 testes passaram, 1 foi pulado e 3 falharam por timeout de 5 segundos nos testes de autenticação com Argon2/rate limit;
- `npm.cmd run typecheck` e `npm.cmd run build`: falharam em seis diagnósticos de tipagem no mock de `src/service-order/infra/http/service-order-routes.spec.ts` (linhas 222–235);
- `npm.cmd run format:check`: apontou `docs/plantuml/DIAGRAMS_INDEX.md`, `docs/plantuml/package.json` e `docs/plantuml/README.md`.

Essas falhas devem ser reavaliadas antes de concluir mudanças futuras; não suprima erros com `any` ou relaxamento global do `tsconfig.json` sem justificar a decisão.

## Convenções para alterações

- Código em inglês; documentação pode ser em português.
- Siga `.prettierrc`: 4 espaços, ponto e vírgula, aspas simples e trailing commas.
- Use `import type` para imports somente de tipo e extensão `.js` nos imports relativos.
- Prefira `unknown` e validação explícita a `any`; respeite `strict`, `noUncheckedIndexedAccess` e `exactOptionalPropertyTypes`.
- Crie exceções específicas e preserve o mapeamento de erros HTTP centralizado em `src/app.ts`.
- Cada nova regra de domínio deve receber teste no mesmo contexto. Mudanças de handler devem testar evento, caso de uso e reprocessamento quando aplicável.
- Não altere arquivos gerados (`dist`, `coverage`) nem documentação/digramas não relacionados ao escopo.

## Fluxo recomendado

1. Identifique o contexto, agregado, porta e fluxo HTTP envolvidos.
2. Leia a implementação e os testes existentes antes de editar.
3. Escreva ou ajuste o teste que expressa a regra.
4. Implemente no agregado/caso de uso correto e mantenha handlers finos.
5. Atualize eventos, consumidores, composição, schema/migrações e documentação quando o contrato mudar.
6. Execute `typecheck`, testes, lint, format check e build conforme o impacto.
7. Revise o diff e confirme que não entraram segredos, arquivos gerados ou mudanças não relacionadas.
