# Autenticação e autorização

O módulo Auth usa senha com hash Argon2id para autenticar usuários, JWT para identificá-los nas requisições e papéis/permissões para decidir o que podem fazer. Nesta branch:

- `POST /users` exige JWT e permissão `USUARIO_PRE_CADASTRAR` (`GERENTE`).
- As rotas de Ordem de Serviço (`/service-orders/*`) exigem JWT Bearer válido (`401 Unauthorized` quando ausente/inválido/inativo) e validam a permissão correspondente ao papel (`403 Forbidden` quando o usuário não possui a permissão exigida).
- As rotas de aprovação de orçamento pelo cliente (`POST /budget-approvals/decide`, `GET /orcamento/:token` e `GET /orcamento`) são públicas para acesso via link de e-mail.
- As rotas de Registry (`/customers` e `/vehicles`) continuam públicas.

## Antes de usar

1. Configure o PostgreSQL como descrito no [README principal](../README.md) e execute `npm run db:migrate` antes de iniciar a API. O seed depende da tabela `auth_users`.
2. Defina `INITIAL_MANAGER_PASSWORD` (senha temporária do gerente inicial) e `JWT_SECRET` (chave aleatória de pelo menos 32 bytes) no ambiente da aplicação. Não versione nem registre esses valores em logs. A API não inicia sem eles.
3. Inicie a API com `npm run dev` ou `npm run build && npm start`. Os exemplos abaixo usam `http://localhost:3000` apenas para desenvolvimento; em produção, use HTTPS.

Quando `auth_users` está vazia, o bootstrap cria `admin@admin.com` com papel `GERENTE` e status `PENDING_FIRST_ACCESS`. O seed não substitui a senha após a ativação nem recria o gerente se já houver outros usuários. `INITIAL_MANAGER_PASSWORD` continua obrigatória em cada inicialização, mesmo quando já existem usuários.

## Primeiro acesso e login

O gerente precisa trocar a senha temporária antes de poder fazer login:

```http
POST /auth/first-access
Content-Type: application/json

{"email":"admin@admin.com","temporaryPassword":"<senha configurada>","newPassword":"<nova senha>"}
```

Sucesso: `204 No Content`. A nova senha deve ser diferente da temporária, ter pelo menos oito caracteres e conter somente letras e números. Cada usuário pré-cadastrado repete esse fluxo com seu próprio e-mail e senha temporária.

Após a ativação:

```http
POST /auth/login
Content-Type: application/json

{"email":"admin@admin.com","password":"<nova senha>"}
```

Sucesso: `200 OK` com `{"token":"<jwt>"}`. O JWT usa HS256, identifica o e-mail do usuário e expira após quatro horas. Ele **não** contém o papel; o sistema verifica a assinatura e busca novamente o usuário no banco a cada requisição autenticada. Usuários desativados não podem continuar usando o token.

## Usar o token para pré-cadastrar usuários

Com o token de um gerente ativo:

```http
POST /users
Authorization: Bearer <jwt>
Content-Type: application/json

{"email":"pessoa@example.com","role":"ATENDENTE"}
```

Sucesso: `201 Created` com `{"temporaryPassword":"<senha gerada>"}`. O novo usuário fica `PENDING_FIRST_ACCESS` até trocar essa senha em `/auth/first-access`. A resposta contém uma credencial em claro: não a registre em logs, não exponha a resposta a terceiros e entregue-a ao novo usuário por um canal seguro. Login e pré-cadastro retornam `Cache-Control: no-store`.

Os papéis aceitos são `ATENDENTE`, `MECANICO`, `ESTOQUISTA` e `GERENTE`. O gerente pode pré-cadastrar usuários com qualquer um deles. O token de um usuário ativo de outro papel **não** autoriza `POST /users`.

## Permissões no código

As regras estão em `src/auth/domain/services/access-policy.ts`:

| Papel        | Permissões                                                                         |
| ------------ | ---------------------------------------------------------------------------------- |
| `ATENDENTE`  | `OS_CRIAR`, `CLIENTE_EDITAR`                                                       |
| `MECANICO`   | `OS_CONCLUIR`, `ESTOQUE_BAIXAR`                                                    |
| `ESTOQUISTA` | `ESTOQUE_BAIXAR`                                                                   |
| `GERENTE`    | Todas as anteriores, `USUARIO_PRE_CADASTRAR`, `USUARIO_GERENCIAR`, `BI_VISUALIZAR` |

Nas rotas de Ordem de Serviço, a proteção é realizada de forma desacoplada pela porta `ActorResolver` (`src/service-order/application/ports/actor-resolver.ts`) e seu adaptador `TokenActorResolver` (`src/infra/token-actor-resolver.ts`):

- `OS_CRIAR` (`ATENDENTE`, `GERENTE`): `POST /service-orders`, `POST /service-orders/:serviceOrderId/cancel` e `POST /service-orders/:serviceOrderId/deliver`.
- `OS_CONCLUIR` (`MECANICO`, `GERENTE`): `PATCH /service-orders/:serviceOrderId/description`, `POST /service-orders/:serviceOrderId/awaiting-approval`, `POST /service-orders/:serviceOrderId/start` e `POST /service-orders/:serviceOrderId/finish`. A descrição pode ser atualizada apenas enquanto a OS está em `PENDING` (avaliação), inclusive no envio para aprovação pelo campo opcional `description`.
- `ESTOQUE_BAIXAR` (`MECANICO`, `ESTOQUISTA`, `GERENTE`): `POST /service-orders/:serviceOrderId/supplies` e `POST /service-orders/:serviceOrderId/supplies/:partCode/usage`.
- Qualquer usuário autenticado ativo (`ATENDENTE`, `MECANICO`, `ESTOQUISTA`, `GERENTE`): `GET /service-orders/:serviceOrderId` e `GET /service-orders/:serviceOrderId/history`.

Nas rotas de Business Intelligence (`/bi/*`), a proteção segue o mesmo padrão via `BiAccessGuard` (`src/business-intelligence/application/ports/bi-access-guard.ts`) e `TokenBiAccessGuard` (`src/infra/token-bi-access-guard.ts`):

- `BI_VISUALIZAR` (`GERENTE`): `GET /bi/service-orders/lead-time` e `GET /bi/stock/restock-lead-time`.

## Erros e limites atuais

| Situação                                                                            | Resposta |
| ----------------------------------------------------------------------------------- | -------- |
| Corpo inválido                                                                      | `400`    |
| Credenciais incorretas; Bearer ausente/inválido em `/service-orders/*`              | `401`    |
| Usuário sem a permissão exigida na rota (`403 Forbidden`)                           | `403`    |
| E-mail já cadastrado em `/users`                                                    | `409`    |
| Mais de cinco tentativas por minuto, por IP e por rota, em login ou primeiro acesso | `429`    |

O limitador usa memória local do processo, portanto não soma as tentativas entre várias instâncias da API.
