import type {
    EventBus,
    EventHandler,
} from '../application/event-bus.js';
import type { DomainEvent } from '../domain/domain-event.js';

export class InMemoryEventBus implements EventBus {
    private readonly handlers = new Map<string, EventHandler[]>();

    async publish(events: DomainEvent[] | DomainEvent): Promise<void> {
        const pendingEvents = Array.isArray(events) ? events : [events];

        for (const event of pendingEvents) {
            const handlers = this.handlers.get(event.eventName) ?? [];
            await Promise.all(handlers.map((handler) => handler(event)));
        }
    }

    subscribe<TEvent extends DomainEvent>(
        eventName: string,
        handler: EventHandler<TEvent>,
    ): void {
        const handlers = this.handlers.get(eventName) ?? [];
        handlers.push(handler as EventHandler);
        this.handlers.set(eventName, handlers);
    }
}
