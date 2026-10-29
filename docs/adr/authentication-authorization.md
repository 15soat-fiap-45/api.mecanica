# ADR: Autenticação por JWT e autorização por mapa fixo de cargos

**Status:** Aceito
**Data:** 29/10/2026

## Contexto

A API é usada por funcionários da oficina com responsabilidades diferentes (atendente, mecânico, estoquista e gerente). É preciso:

1. identificar quem faz cada requisição, inclusive para registrar o autor das mudanças de fase da OS;
2. restringir operações por responsabilidade (abrir OS, concluir OS, baixar estoque, gerenciar estoque, cadastrar usuários, ver BI);
3. permitir que a gerência cadastre funcionários sem que ninguém conheça a senha final deles;
4. manter o mecanismo simples para um MVP, sem infraestrutura adicional.

O cliente da oficina não tem conta: ele decide o orçamento por um link com token de uso único, fora deste mecanismo.

## Alternativas consideradas

### 1. JWT assinado, sem estado no servidor

**Prós**

- Sem armazenamento de sessão: qualquer instância valida o token só com a chave.
- Padrão amplamente suportado por clientes HTTP e pelo Swagger (`bearerAuth`).

**Contras**

- Token não pode ser revogado antes de expirar sem um mecanismo adicional.
- Exige cuidado com segredo, algoritmo e expiração.

### 2. Sessão no servidor com cookie

**Prós**

- Revogação imediata.

**Contras**

- Exige armazenamento de sessão (tabela ou Redis) e proteção contra CSRF.
- Menos natural para uma API consumida por clientes diversos.

### 3. Provedor de identidade externo (Keycloak, Auth0, Cognito)

**Prós**

- MFA, recuperação de senha e gestão de usuários prontos.

**Contras**

- Infraestrutura, configuração ou custo desproporcionais para o MVP.
- Demo e testes dependentes de um serviço externo.

### Autorização: mapa fixo em código vs. RBAC em tabela

- **Mapa fixo em código:** simples, versionado e testado junto com o código; mudar permissões exige deploy.
- **Papéis e permissões em tabela:** configurável em tempo de execução, mas exige telas, migrações e regras para evitar que um usuário retire o próprio acesso. Desnecessário com quatro cargos estáveis.

## Decisão

### Autenticação

- **JWT HS256** emitido por `POST /auth/login`, assinado com `jose`, com `sub` igual ao e-mail do usuário e **expiração de 4 horas**. O segredo (`JWT_SECRET`) precisa ter pelo menos 32 bytes, ou a aplicação não sobe.
- **A cada requisição**, `ResolveAuthenticatedUser` valida o token **e relê o usuário no banco**, exigindo status `ACTIVE`. Assim, desativação e troca de cargo valem na hora, sem lista de revogação.
- Senhas com **Argon2id**. O login executa a verificação de hash mesmo quando o e-mail não existe, para não revelar quais e-mails estão cadastrados pelo tempo de resposta.

### Ciclo de vida do usuário

- Não há cadastro aberto. Um **GERENTE** faz o pré-cadastro (`POST /users`, permissão `USUARIO_PRE_CADASTRAR`) informando e-mail e cargo.
- O sistema gera uma **senha temporária aleatória** (`crypto.randomBytes`), salva apenas o hash e cria o usuário com status `PENDING_FIRST_ACCESS`.
- No **primeiro acesso** (`POST /auth/first-access`), o usuário prova a senha temporária e define a definitiva, que não pode ser igual à temporária. Só então a conta fica `ACTIVE`. Login com conta pendente é recusado.
- Na primeira inicialização, se não houver usuários, é criado o gerente inicial `admin@admin.com` com `INITIAL_MANAGER_PASSWORD`, também pendente de primeiro acesso.

### Autorização

Cargos e permissões fixos no domínio do `auth` (`rolePermissions`):

| Cargo | Permissões |
|---|---|
| ATENDENTE | `OS_CRIAR`, `CLIENTE_EDITAR` |
| MECANICO | `OS_CONCLUIR`, `ESTOQUE_BAIXAR` |
| ESTOQUISTA | `ESTOQUE_BAIXAR` |
| GERENTE | todas, incluindo `ESTOQUE_GERENCIAR`, `USUARIO_PRE_CADASTRAR`, `USUARIO_GERENCIAR` e `BI_VISUALIZAR` |

### Integração com os módulos

Os módulos não dependem do `auth`: dependem de portas (`ActorResolver`, usada por registry, service-order e stock; `BiAccessGuard`, no BI), e os adaptadores `TokenActorResolver` e `TokenBiAccessGuard`, em `src/infra`, a implementam usando `ResolveAuthenticatedUser`. As rotas verificam o token e a permissão em `preValidation`, respondendo 401 sem token válido e 403 sem permissão. O ator autenticado é propagado por `actorContext` (`AsyncLocalStorage`) para registrar autoria.

### Regras

1. Toda rota de negócio exige token e permissão; rotas públicas são exceções explícitas (login, primeiro acesso, health e o fluxo de aprovação do cliente por token).
2. Permissões são verificadas pelo cargo atual lido do banco, não por claims gravadas no token.
3. Nenhuma senha (temporária ou definitiva) é armazenada ou registrada em texto puro.
4. Na dúvida, o acesso é negado: ator sem cargo ou sem permissão recebe 403.

## Consequências

**Positivas**

- Sem infraestrutura de sessão nem serviço externo.
- Desativação e troca de cargo têm efeito imediato, porque o usuário é relido a cada requisição.
- Ninguém, nem o gerente, conhece a senha definitiva do funcionário.
- Os módulos de negócio ficam independentes do `auth`, ligados só pelas portas.

**Negativas / riscos aceitos**

- Uma consulta ao banco por requisição autenticada.
- Sem refresh token: o usuário refaz login a cada 4 horas.
- Mudar permissões de um cargo exige deploy.
- Sem recuperação de senha nem MFA.
- A senha temporária é devolvida na resposta do pré-cadastro e precisa ser repassada ao funcionário por fora do sistema.
- A regra de senha aceita apenas letras e números, com no mínimo 8 caracteres.
- `ChangeUserRole` e `DeactivateUser` existem como casos de uso, mas ainda não têm rota HTTP.
- O `TokenActorResolver` concede acesso quando o verificador não informa cargo nem permissões, contrariando a regra 4. Com o `ResolveAuthenticatedUser` atual isso não ocorre, porque o cargo sempre vem do banco, mas o padrão deve ser negar.
- `ESTOQUE_GERENCIAR` restringe todas as rotas de estoque ao GERENTE; o ESTOQUISTA só baixa estoque por meio da OS.

## Gatilhos para revisar esta decisão

- Necessidade de revogar tokens sem depender da consulta ao banco, ou de reduzir essa consulta por desempenho.
- Cargos ou permissões configuráveis pela própria oficina.
- Exigência de MFA, recuperação de senha ou login único com outros sistemas.
- Clientes da oficina passarem a ter conta própria.

Nesses casos, avaliar refresh tokens com revogação, RBAC em tabela ou um provedor de identidade externo, mantendo as portas `ActorResolver` e `BiAccessGuard`.
