import type { DomainEvent } from '../domain/domain-event.js';

export interface EventBus {
    publish(events: DomainEvent[] | DomainEvent): Promise<void>;
}
