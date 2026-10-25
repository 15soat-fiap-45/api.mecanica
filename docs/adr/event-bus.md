# ADR: Event Bus in-process para comunicação entre domínios

**Status:** Aceito
**Data:** 21/10/2026

## Contexto

Alguns use-cases de um domínio precisam que outros domínios reajam ao que aconteceu. Chamar os módulos diretamente amarra o código: um domínio passa a conhecer o outro e mudanças se propagam entre eles.

Com um event bus, o domínio publica fatos (`DomainEvent`) sem saber quem os consome. Isso mantém os domínios isolados e deixa a porta aberta para uma eventual extração para sistema distribuído.

## Alternativas consideradas

### 1. Event bus nativo em TypeScript (in-process)

**Prós**
- Zero infraestrutura: sem broker, sem custo, sem operação.
- Debug simples (mesmo processo, mesmo stack trace) e testes sem containers.
- Tipagem de ponta a ponta com TypeScript.
- Deploy único, coerente com um monolito modular.

**Contras**
- Sem durabilidade: se o processo cair, eventos em andamento são perdidos.
- Sem retry, DLQ ou replay.
- Não funciona com múltiplas instâncias: o evento só chega aos handlers da instância que publicou.
- É código próprio para manter.

### 2. Broker externo (RabbitMQ / Kafka / SQS-SNS)

**Prós**
- Durabilidade, retry, DLQ e entrega entre instâncias e serviços.
- Escala independente dos consumidores.
- Kafka oferece log persistente e replay; RabbitMQ, roteamento flexível; SQS/SNS, operação gerenciada.

**Contras**
- Custo de infraestrutura e operação (Kafka é o mais pesado; SQS/SNS gera lock-in na AWS).
- Consistência eventual obrigatória; ambiente local e testes mais complexos.
- Exige serialização e versionamento de schema desde o início.
- Novos modos de falha: broker indisponível, mensagens duplicadas.
- Desproporcional para um monolito modular sem demanda de distribuição.

## Decisão

Adotar um **event bus in-memory em TypeScript**, implementado em `InMemoryEventBus`.

O sistema é um monolito modular, e as vantagens dos brokers (durabilidade, distribuição, escala) resolvem problemas que ainda não existem. Pagar esse custo agora seria antecipar uma necessidade hipotética.

### Contrato

Os módulos dependem apenas da interface `EventBus`, nunca da implementação concreta:

```ts
interface EventBus {
    publish(events: DomainEvent[] | DomainEvent): Promise<void>;
    subscribe<TEvent extends DomainEvent>(
        eventName: string,
        handler: EventHandler<TEvent>,
    ): () => void; // retorna a função de unsubscribe
}
```

### Comportamento da implementação

- **Assinatura por nome de evento** (`eventName`), com vários handlers por evento.
- **Execução sequencial**, na ordem de registro dos handlers, e `publish` só resolve depois que todos terminam.
- **Falha de handler é isolada:** o erro é logado (`logger.error` com `eventName` e `error`) e não afeta o publicador nem os handlers seguintes.
- **Iteração sobre cópia** da lista de handlers, para que `subscribe`/`unsubscribe` durante a publicação não alterem o loop.
- **Logger injetado** por construtor, com interface mínima (`error(context, message)`).

### Regras para quem usa o bus

1. Domínios só se comunicam por eventos, sem import direto de código de outro domínio.
2. Eventos são contratos serializáveis: payload simples (JSON-safe), sem instâncias de classe nem referências a entidades.
3. Handlers devem ser **idempotentes**, pois brokers reais entregam "at-least-once".
4. **Não assumir que o efeito do handler já aconteceu quando `publish` retorna.** Hoje o publicador espera os handlers, mas isso não vale após a migração para broker.
5. Não depender de ordem global de entrega entre eventos diferentes.
6. Evitar publicar eventos dentro de handlers de forma circular (a cascata é síncrona e pode crescer o stack).

## Consequências

**Positivas**
- Entrega rápida, sem infraestrutura nova.
- Domínios desacoplados desde já.
- Migração para broker concentrada em uma nova implementação de `EventBus`, desde que as regras acima sejam seguidas.

**Negativas / riscos aceitos**
- **Eventos perdidos em caso de falha:** um handler que falha é apenas logado, sem retry nem DLQ, e um crash do processo perde eventos em andamento.
- Uma falha silenciosa em handler pode deixar domínios inconsistentes entre si; depende de monitoramento dos logs.
- Não suporta múltiplas instâncias da aplicação consumindo o mesmo evento.
- Handlers lentos atrasam o `publish`, e portanto o use-case que publicou.
- `eventName` é `string` livre: o compilador não impede assinar um evento com handler de payload diferente.

**Mitigações**
- Para fluxos que exijam garantia de entrega antes da migração, usar **Transactional Outbox** (persistir o evento na mesma transação do dado e despachar depois).
- Alertar sobre a mensagem `event handler failed` nos logs.
- Se a tipagem se tornar um problema, introduzir um `EventMap` (`nome → tipo do evento`) na interface.

## Gatilhos para revisar esta decisão

- Necessidade de múltiplas instâncias com consumo coordenado de eventos.
- Extração de um módulo para serviço separado.
- Fluxos que exijam garantia de entrega, retry ou replay.
- Handlers lentos impactando a latência dos use-cases.

Nesses casos, avaliar RabbitMQ, SQS/SNS ou Kafka conforme o requisito dominante (roteamento, simplicidade operacional na AWS ou replay).