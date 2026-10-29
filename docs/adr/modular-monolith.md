# ADR: Monólito modular com DDD e Clean Architecture

**Status:** Aceito
**Data:** 29/10/2026

## Contexto

O sistema da oficina mecânica cobre contextos de negócio distintos: cadastro de clientes e veículos, ordens de serviço e orçamentos, estoque e reservas de peças, autenticação e indicadores de Business Intelligence. Cada contexto tem regras, vocabulário e ritmo de evolução próprios, e a equipe é pequena.

É preciso decidir como organizar o código e o deploy para que:

1. as regras de negócio fiquem isoladas de framework, banco e protocolo;
2. os contextos evoluam sem se acoplar uns aos outros;
3. o custo de operação e de desenvolvimento do MVP continue baixo.

## Alternativas consideradas

### 1. Monólito em camadas tradicional (controller → service → repository)

**Prós**

- Simples e conhecido por qualquer desenvolvedor.
- Pouco código de estrutura no início.

**Contras**

- Regras de negócio tendem a vazar para services e repositórios, misturadas com acesso a dados e framework.
- Sem fronteiras entre contextos, qualquer parte do código acessa qualquer tabela ou serviço, e o acoplamento cresce sem controle.
- Difícil testar regras sem banco e sem HTTP.

### 2. Microsserviços

**Prós**

- Deploy e escala independentes por contexto.
- Fronteiras impostas pela rede.

**Contras**

- Exigem infraestrutura e operação (orquestração, observabilidade, broker, tracing) desproporcionais para um MVP e uma equipe pequena.
- Introduzem consistência eventual, falhas de rede e versionamento de contratos desde o primeiro dia.
- Ambiente local e testes mais complexos.

### 3. Monólito modular com DDD e Clean Architecture

**Prós**

- Um único deploy e um único processo, com fronteiras explícitas entre contextos.
- Domínio puro, testável sem banco, framework ou HTTP.
- Contextos desacoplados por eventos, com caminho aberto para extração futura.

**Contras**

- Exige disciplina para manter as fronteiras, já que o compilador não as impõe.
- Mais estrutura (camadas, portas, composition roots) do que um CRUD simples.
- Escala e deploy são únicos para todos os módulos.

## Decisão

Organizar o sistema como um **monólito modular**, com um **módulo por bounded context** e **Clean Architecture** dentro de cada módulo. A aplicação é entregue como uma única imagem (`Dockerfile`) e um único container de API no Compose.

### Módulos

`auth`, `registry`, `service-order`, `stock` e `business-intelligence`, em `src/<módulo>`, mais um núcleo compartilhado em `src/shared`.

### Camadas dentro de cada módulo

- **`domain`**: entidades, agregados, value objects, eventos de domínio e regras. Não depende de framework, banco nem de camadas externas.
- **`application`**: casos de uso, handlers de eventos e **portas** (interfaces) que descrevem o que a aplicação precisa do mundo externo (por exemplo `EmailSender`, `ActorResolver`, `BiAccessGuard`).
- **`infra`**: adaptadores que implementam as portas (HTTP com Fastify, e-mail SMTP, persistência com Drizzle).

### Regra de dependência

As dependências apontam para dentro: `infra → application → domain`. O domínio não conhece a aplicação nem a infraestrutura, e a aplicação não importa adaptadores de infra. Para os adaptadores serem trocáveis, a aplicação só conhece interfaces.

### Comunicação entre módulos

- Módulos se comunicam por **eventos de domínio**, publicados e consumidos pelo `EventBus` (ver ADR do Event Bus), com nomes no padrão `<módulo>.<evento>` (por exemplo `service-order.finished`).
- O consumidor declara o seu **próprio contrato do evento** (por exemplo `business-intelligence/application/contracts` e os handlers de `stock`), em vez de importar tipos do módulo produtor. Assim o produtor pode mudar internamente sem quebrar o consumidor.
- O módulo de BI mantém suas próprias projeções, com schema próprio (ver ADR de BI).

### Composição

Cada módulo expõe um composition root que monta seus casos de uso e assina seus handlers. A montagem final e a injeção de dependências entre módulos ficam em `src/index.ts`, o único lugar que conhece todos os módulos. Adaptadores que ligam um módulo ao outro (por exemplo `TokenActorResolver`, `RegistryVehicleContactLookup`) ficam em `src/infra`, fora dos módulos.

### Regras

1. O domínio não importa framework, ORM, HTTP nem código de outras camadas.
2. Um módulo não importa código de domínio ou de aplicação de outro módulo; a integração se dá por eventos ou por portas implementadas na composição.
3. Dependências de módulos externos (banco, e-mail, autenticação) entram como portas, nunca como import direto de infra.
4. Regras de negócio ficam no domínio, não nos controladores nem nos repositórios.
5. Cada módulo tem seu composition root dentro da própria pasta.

## Consequências

**Positivas**

- Regras de negócio testáveis sem banco, framework ou HTTP.
- Contextos desacoplados, com contratos de evento próprios do consumidor.
- Adaptadores trocáveis sem mexer no domínio (por exemplo MailHog por provedor real).
- Um único deploy, com baixo custo operacional.
- Caminho aberto para extrair um módulo como serviço, já que ele se comunica por eventos.

**Negativas / riscos aceitos**

- As fronteiras dependem de convenção e de revisão de código; nada no compilador as impõe.
- Há mais estrutura do que um CRUD exigiria.
- Escala e deploy são únicos para todos os módulos.
- O padrão ainda não é totalmente uniforme:
    - A porta `ActorResolver` e o `actorContext` vivem em `service-order`, mas são usados por `registry` e `stock` (acoplamento entre módulos, a ser movido para `shared`).
    - O composition root de `stock` está em `src/composition-root.ts`, fora do módulo, e as rotas de `stock` importam `StockUseCases` de lá, contrariando a regra 5. O mesmo arquivo mantém uma função `compositionRoot()` global sem uso.
    - A persistência Drizzle de `registry`, `service-order`, `stock` e BI fica centralizada em `src/infra/database`, enquanto `auth` mantém a sua dentro do módulo.
    - O guard HTTP de autenticação está duplicado em cada arquivo de rotas.

**Mitigações**

- Mover `ActorResolver` e `actorContext` para `src/shared/application`.
- Mover o composition root de `stock` para `src/stock/composition-root.ts` e remover o `compositionRoot()` global.
- Padronizar o local dos adaptadores de persistência e extrair um guard HTTP único.
- Se a erosão das fronteiras virar problema, impor as regras de dependência com análise automática (por exemplo `dependency-cruiser` ou regras de lint) na CI.

## Gatilhos para revisar esta decisão

- Necessidade de escalar ou implantar um módulo de forma independente.
- Equipes separadas por contexto, com ciclos de release distintos.
- Fronteiras entre módulos se erodindo apesar da revisão de código.

Nesses casos, avaliar a extração do módulo afetado como serviço, comunicando-se por um broker (ver gatilhos do ADR do Event Bus), e impor as fronteiras de forma automática.
