import { describe, expect, it, vi } from 'vitest';
import { InMemoryEventBus } from './in-memory-event-bus.js';
import type { DomainEvent } from '../domain/domain-event.js';

const makeEvent = (eventName: string): DomainEvent => ({
    eventId: 'event-1',
    eventName,
    aggregateId: 'aggregate-1',
    occurredOn: new Date(),
});

describe('InMemoryEventBus', () => {
    it('publishes an event to all subscribers of its name', async () => {
        const eventBus = new InMemoryEventBus();
        const firstHandler = vi.fn();
        const secondHandler = vi.fn();
        const event = makeEvent('registry.customer-registered');

        eventBus.subscribe(event.eventName, firstHandler);
        eventBus.subscribe(event.eventName, secondHandler);

        await eventBus.publish(event);

        expect(firstHandler).toHaveBeenCalledWith(event);
        expect(secondHandler).toHaveBeenCalledWith(event);
    });

    it('publishes an array of events in order', async () => {
        const eventBus = new InMemoryEventBus();
        const received: string[] = [];

        eventBus.subscribe('first', (event) => {
            received.push(event.eventName);
        });
        eventBus.subscribe('second', (event) => {
            received.push(event.eventName);
        });

        await eventBus.publish([makeEvent('first'), makeEvent('second')]);

        expect(received).toEqual(['first', 'second']);
    });
});
