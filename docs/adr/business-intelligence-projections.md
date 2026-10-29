# ADR: Projeções Dedicadas e Integração Orientada a Eventos para o Módulo de Business Intelligence

**Status:** Aceito  
**Data:** 28/10/2026

## Contexto

A oficina mecânica precisa acompanhar indicadores de desempenho operacional:

1. **Tempo médio de atendimento de Ordens de Serviço (Lead Time de O.S.):**
    - Tempo total desde o cadastro até a finalização técnica (`registered → finished`).
    - Tempo efetivo de execução mecânica (`execution-started → finished`).
    - Tempo ponta a ponta até a entrega ao cliente (`registered → delivered`).
2. **Tempo médio de reposição de estoque:**
    - Intervalo de tempo entre uma peça atingir nível crítico de reposição e ser reabastecida.
    - Observação de contexto: a funcionalidade de histórico de alterações de estoque ainda está sendo implementada por outra equipe em branch paralela.

Para atender a esses requisitos dentro de uma arquitetura modular baseada em Domain-Driven Design (DDD), surgiram duas abordagens fundamentais:

- **Abordagem A (Consultas diretas com JOIN):** O BI consulta diretamente as tabelas dos schemas `service_order` e `public` (tabelas de histórico e ordens de serviço) via queries SQL agregadas.
- **Abordagem B (Projeções / Read Models Orientados a Eventos):** O BI atua como um bounded context isolado com seu próprio schema (`business_intelligence`), consome eventos assíncronos via `EventBus` e mantém tabelas de projeção otimizadas para leitura e cálculo temporal.

---

## Alternativas Consideradas

### 1. Consultas Diretas com JOIN nas Tabelas Operacionais

**Prós:**

- Sem tabelas intermediárias de projeção.
- Dados sempre 100% consistentes em tempo real com o estado operacional das ordens de serviço.

**Contras:**

- **Forte acoplamento entre contextos:** O módulo de BI passa a depender da estrutura interna de tabelas, nomes de colunas e enums de `service_order` e `stock`.
- **Impacto de performance em tabelas transacionais:** Agregações analíticas com `AVG()`, `MIN()`, `MAX()` e filtros de data concorrem diretamente com locks de escrita da operação da oficina.
- **Dificuldade de evolução e extração:** Impossibilita extrair o BI para um serviço separado ou banco analítico sem reescrever o acesso a dados.
- **Bloqueio pelo módulo de estoque:** Como o histórico de estoque não estava concluído na branch principal, o BI ficaria travado aguardando o schema final da outra equipe.

---

### 2. Projeções Dedicadas com Integração via EventBus (CQRS / Event-Driven)

**Prós:**

- **Zero acoplamento de schema:** O BI não lê nem referencia tabelas de outros domínios; não há chaves estrangeiras transcontextuais.
- **Contratos orientados ao consumidor (_Consumer-Driven Contracts_):** O BI declara localmente apenas os campos de que necessita nos eventos.
- **Consultas analíticas rápidas:** As métricas são calculadas sobre tabelas de projeção enxutas (`service_order_timeline` e `restock_cycle`), com índices temporais específicos.
- **Desacoplamento do histórico de estoque:** Permite criar uma estratégia provisória plugável (`RestockCyclePolicy`) consumindo o evento de estoque. Inicialmente isso foi feito com `stock.stock-updated`; hoje o `PartSupply` publica `stock.movement-recorded`, que o BI passou a assinar no lugar do primeiro.

**Contras:**

- Consistência eventual: o dado analítico reflete o processamento do evento.
- Necessidade de tabelas próprias de projeção no PostgreSQL (`schema business_intelligence`).
- No barramento in-memory atual, eventos anteriores à criação da projeção ou disparados durante downtime do processo não possuem replay nativo.

---

## Decisão

Adotar a **Abordagem B: Projeções Dedicadas Orientadas a Eventos**.

1. **Schema Exclusivo no PostgreSQL:**
    - Criação do schema `business_intelligence` com as tabelas `service_order_timeline` e `restock_cycle`.
    - Nenhuma constraint `FOREIGN KEY` aponta para schemas externos (`service_order` ou `public`).

2. **Consumo Desacoplado via `EventBus`:**
    - O BI assina eventos do barramento in-process (`service-order.registered`, `service-order.execution-started`, `service-order.finished`, `service-order.delivered`, `service-order.cancelled` e `stock.movement-recorded`). O `stock.stock-updated` não é assinado, porque o estoque emite os dois eventos para a mesma movimentação.
    - Apenas o BI conhece suas projeções. Os emissores não sabem que o BI existe.

3. **Estratégia Plugável para Reposição (`RestockCyclePolicy`):**
    - Criação da interface de política `RestockCyclePolicy` com implementação padrão `ReorderPointRestockPolicy(reorderPoint)`.
    - Permite que o módulo funcione imediatamente utilizando o evento de estoque, e a troca de `stock.stock-updated` para `stock.movement-recorded` foi feita apenas no `composition-root.ts`, sem alterar use cases nem o modelo de domínio do BI.

4. **Tratamento de Anomalias e Idempotência:**
    - Apenas a primeira ocorrência de cada marco temporal é considerada (idempotência diante de reentregas).
    - Ordens com `cancelledAt` são excluídas das médias.
    - Amostras com intervalos negativos (eventos fora de ordem) geram métricas nulas locais e não corrompem as estatísticas gerais.

---

## Consequências

**Positivas:**

- Respeito integral aos princípios de DDD e Bounded Contexts.
- Independência completa em relação ao ritmo de entrega da equipe de estoque.
- Facilidade para migração futura: se o BI for migrado para um Data Warehouse (ex: ClickHouse ou BigQuery) ou microsserviço isolado, a camada de aplicação e os adaptadores de evento permanecem idênticos.
- Queries analíticas simples, indexadas e isoladas da carga transacional da oficina.

**Riscos e Mitigações:**

- **Ausência de Replay no InMemoryEventBus:** Como documentado na [ADR do Event Bus](event-bus.md), o barramento em memória não possui retenção de eventos históricos. Caso seja necessário reconstruir projeções do passado, um script de sincronização inicial ou a migração para broker durável (RabbitMQ/Kafka) poderá ser adotada.
