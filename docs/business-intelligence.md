# Business Intelligence (BI) — Lead Time de O.S. e Tempo Médio de Reposição

O contexto delimitado **Business Intelligence** (`src/business-intelligence/`) consolida indicadores operacionais da oficina sem acoplamento direto aos domínios ou tabelas de **Service Order** e **Stock**.

## Princípios de isolamento

1. **Integração exclusivamente via `EventBus`:** o BI assina eventos publicados pelos outros contextos e alimenta projeções próprias (_read models_) no schema `business_intelligence`.
2. **Contratos locais orientados ao consumidor:** os formatos de eventos esperados pelo BI são declarados em `src/business-intelligence/application/contracts/` sem importar classes de `src/service-order/` ou `src/stock/`.
3. **Sem _foreign keys_ cruzadas:** as tabelas `business_intelligence.service_order_timeline` e `business_intelligence.restock_cycle` pertencem exclusivamente ao BI (`infra/postgres/init/06-business-intelligence.sql`).
4. **Autorização desacoplada:** a porta `BiAccessGuard` (`src/business-intelligence/application/ports/bi-access-guard.ts`) e o adaptador `TokenBiAccessGuard` (`src/infra/token-bi-access-guard.ts`) verificam a permissão `BI_VISUALIZAR` (concedida ao papel `GERENTE`) sem acoplar o módulo de BI ao módulo `auth`.

---

## Métricas calculadas

Todas as estatísticas usam o objeto de valor `DurationStats`:

```json
{
    "count": 10,
    "averageMs": 2700000,
    "minMs": 1800000,
    "maxMs": 3600000
}
```

Quando não há amostras no período filtrado, `count` é `0` e `averageMs`, `minMs` e `maxMs` retornam `null`.

### 1. Tempo médio de Ordens de Serviço (`GET /bi/service-orders/lead-time`)

Calcula três métricas (excluindo ordens canceladas):

- **`totalLeadTime`**: `finishedAt - registeredAt` (lead time total até a conclusão técnica).
- **`executionTime`**: `finishedAt - executionStartedAt` (tempo efetivo de execução a partir do primeiro início).
- **`deliveryLeadTime`**: `deliveredAt - registeredAt` (lead time ponta a ponta até a entrega do veículo ao cliente).

Parâmetros de query opcionais (ISO-8601):

- `from`: data/hora inicial do período (filtra por `finishedAt` nas duas primeiras métricas e por `deliveredAt` na terceira).
- `to`: data/hora final do período.

### 2. Tempo médio de reposição de estoque (`GET /bi/stock/restock-lead-time`)

Mede quanto tempo uma peça/insumo permanece em necessidade de reposição até ser reabastecida.

Parâmetros de query opcionais:

- `partCode`: filtra por código da peça (normalizado para maiúsculas).
- `from` e `to`: filtram ciclos encerrados (`closedAt`) no intervalo `[from, to]`.

Retorna:

- `policy`: descrição da política ativa (ex.: `{ "name": "REORDER_POINT", "reorderPoint": 0 }`).
- `overall`: estatísticas agregadas de todos os ciclos encerrados.
- `byPart`: estatísticas por `partCode`, incluindo `openCycleSince` (timestamp ISO-8601 caso a peça esteja aguardando reposição no momento, ou `null`).

---

## Política e contrato de reposição (integração com Histórico de Estoque)

Como o histórico de alterações de estoque está sendo implementado em outra branch, o cálculo de reposição foi estruturado em três camadas desacopladas:

1. **Modelo neutro (`StockMovement`)**: `src/business-intelligence/domain/restock-cycle/stock-movement.ts`.
2. **Adaptadores de evento (`stock-movement-adapters.ts`)**: traduzem eventos externos para `StockMovement`.
3. **Estratégia (`RestockCyclePolicy`)**: define quando um ciclo abre (`opensCycle`) e quando fecha (`closesCycle`). A implementação padrão é `ReorderPointRestockPolicy(reorderPoint)`, configurável via variável de ambiente `BI_REORDER_POINT` (padrão `0`).

### Regra padrão (`ReorderPointRestockPolicy`)

- **Abertura do ciclo:** ocorre em uma movimentação de saída (`EXIT`) quando `quantityAfter <= reorderPoint` e ainda não há ciclo aberto para aquele `partCode`.
- **Fechamento do ciclo:** ocorre na primeira movimentação de entrada (`ENTRY`, exceto ajustes com `reason === 'MANUAL'`) em que `quantityAfter > reorderPoint`, registrando `closedAt = occurredOn`.

### Contratos de eventos de Estoque suportados

O `businessIntelligenceCompositionRoot` já assina **ambos** os eventos abaixo:

1. **Evento atual do agregado `PartSupply` (`stock.stock-updated`):**

    ```ts
    interface StockUpdatedContract extends DomainEvent {
        readonly eventName: 'stock.stock-updated';
        readonly partCode: string;
        readonly movementType: 'ENTRY' | 'EXIT';
        readonly movedQuantity: number;
        readonly previousQuantity: number;
        readonly currentQuantity: number;
    }
    ```

2. **Contrato proposto para a equipe de Histórico de Estoque (`stock.movement-recorded`):**
    ```ts
    interface StockMovementRecordedContract extends DomainEvent {
        readonly eventName: 'stock.movement-recorded';
        readonly aggregateId: string; // ID do PartSupply
        readonly movementId: string; // ID único do registro de histórico
        readonly partCode: string;
        readonly movementType: 'ENTRY' | 'EXIT' | 'ADJUSTMENT';
        readonly reason:
            'PURCHASE' | 'SERVICE_ORDER' | 'RESERVATION' | 'MANUAL' | 'RETURN';
        readonly quantity: number;
        readonly quantityBefore: number;
        readonly quantityAfter: number;
        readonly referenceId?: string;
        readonly occurredOn: Date;
    }
    ```

> **Atenção ao integrar o módulo de Estoque:** quando ambos os eventos estiverem ativos, mantenha apenas **uma** inscrição ativa em `src/business-intelligence/composition-root.ts` (preferencialmente `stock.movement-recorded`) para evitar dupla contagem da mesma movimentação.

---

## Checklist de integração entre contextos

| Contexto          | Evento                               | Status no repositório                                                                 |
| ----------------- | ------------------------------------ | ------------------------------------------------------------------------------------- |
| **Service Order** | `service-order.registered`           | Publicado em `RegisterServiceOrder` e consumido pelo BI                               |
| **Service Order** | `service-order.execution-started`    | Publicado em `ServiceOrder.startExecution()` (`ChangeServiceOrderStatus`) e consumido |
| **Service Order** | `service-order.finished`             | Publicado em `ServiceOrder.finish()` e consumido pelo BI                              |
| **Service Order** | `service-order.delivered`            | Publicado em `ServiceOrder.deliver()` (`ChangeServiceOrderStatus`) e consumido        |
| **Service Order** | `service-order.cancelled`            | Publicado em `CancelServiceOrder` e consumido pelo BI                                 |
| **Stock**         | `stock.stock-updated`                | Emitido por `PartSupply`; aguarda ligação dos casos de uso de Stock no `src/index.ts` |
| **Stock History** | `stock.movement-recorded` (proposto) | Adaptador e assinatura prontos no BI; aguarda implementação na branch de estoque      |
