import type { DomainEvent } from '../domain/domain-event.js';

export type EventHandler<TEvent extends DomainEvent = DomainEvent> = (
    event: TEvent,
) => Promise<void> | void;

export interface EventBus {
    publish(events: DomainEvent[] | DomainEvent): Promise<void>;
    subscribe<TEvent extends DomainEvent>(
        eventName: string,
        handler: EventHandler<TEvent>,
    ): void;
}
