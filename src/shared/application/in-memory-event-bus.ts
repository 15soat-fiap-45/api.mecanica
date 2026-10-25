import type { DomainEvent } from '../domain/domain-event.js';
import type { EventBus, EventHandler } from './event-bus.js';

interface Logger {
    error(context: Record<string, unknown>, message: string): void;
}

interface HandlerRegistration {
    handler: EventHandler;
}
/**
 * In-memory event bus: handlers run in the same process, sequentially,
 * and `publish` resolves only after every handler finishes.
 *
 * A failing handler is logged and does not affect the publisher or the
 * remaining handlers.
 *
 * shortcut: no retry, DLQ or durability — a failed event is lost.
 * Those guarantees need a real broker.
 */
export class InMemoryEventBus implements EventBus {
    private readonly handlers = new Map<string, HandlerRegistration[]>();

    constructor(private readonly logger: Logger) {}

    subscribe<TEvent extends DomainEvent>(
        eventName: string,
        handler: EventHandler<TEvent>,
    ): () => void {
        const handlers = this.handlers.get(eventName) ?? [];
        const registration: HandlerRegistration = {
            handler: handler as EventHandler,
        };
        handlers.push(registration);
        this.handlers.set(eventName, handlers);
        return () => {
            const index = handlers.indexOf(registration);
            if (index !== -1) handlers.splice(index, 1);
        };
    }

    async publish(events: DomainEvent[] | DomainEvent): Promise<void> {
        for (const event of Array.isArray(events) ? events : [events]) {
            const handlers = [...(this.handlers.get(event.eventName) ?? [])];
            for (const { handler } of handlers) {
                try {
                    await handler(event);
                } catch (error) {
                    this.logger.error(
                        { error, eventName: event.eventName },
                        'event handler failed',
                    );
                }
            }
        }
    }
}
