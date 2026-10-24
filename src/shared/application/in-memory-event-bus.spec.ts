import { describe, expect, it, vi } from 'vitest';
import type { DomainEvent } from '../domain/domain-event.js';
import { InMemoryEventBus } from './in-memory-event-bus.js';

const makeEvent = (eventName: string): DomainEvent => ({
    eventId: crypto.randomUUID(),
    eventName,
    occurredOn: new Date(),
    aggregateId: 'aggregate-1',
});

const makeBus = () => {
    const logger = { error: vi.fn() };
    return { bus: new InMemoryEventBus(logger), logger };
};

describe('InMemoryEventBus', () => {
    it('dispatches a published event to handlers subscribed to its name', async () => {
        const { bus } = makeBus();
        const handler = vi.fn();
        bus.subscribe('service-order.registered', handler);

        const event = makeEvent('service-order.registered');
        await bus.publish(event);

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(event);
    });

    it('publishes each event of an array in order', async () => {
        const { bus } = makeBus();
        const calls: string[] = [];
        bus.subscribe('a', () => {
            calls.push('a');
        });
        bus.subscribe('b', () => {
            calls.push('b');
        });

        await bus.publish([makeEvent('a'), makeEvent('b')]);

        expect(calls).toEqual(['a', 'b']);
    });

    it('does not call handlers subscribed to other event names', async () => {
        const { bus } = makeBus();
        const handler = vi.fn();
        bus.subscribe('other.event', handler);

        await bus.publish(makeEvent('some.event'));

        expect(handler).not.toHaveBeenCalled();
    });

    it('awaits async handlers before resolving', async () => {
        const { bus } = makeBus();
        let finished = false;
        bus.subscribe('a', async () => {
            await Promise.resolve();
            finished = true;
        });

        await bus.publish(makeEvent('a'));

        expect(finished).toBe(true);
    });

    it('dispatches events published inside a handler', async () => {
        const { bus } = makeBus();
        const handler = vi.fn();
        bus.subscribe('a', () => bus.publish(makeEvent('b')));
        bus.subscribe('b', handler);

        await bus.publish(makeEvent('a'));

        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('logs a failing handler and still runs the remaining ones', async () => {
        const { bus, logger } = makeBus();
        const failure = new Error('boom');
        const next = vi.fn();
        bus.subscribe('a', () => {
            throw failure;
        });
        bus.subscribe('a', next);

        await bus.publish(makeEvent('a'));

        expect(logger.error).toHaveBeenCalledWith(
            { error: failure, eventName: 'a' },
            'event handler failed',
        );
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('stops calling a handler after it is unsubscribed', async () => {
        const { bus } = makeBus();
        const handler = vi.fn();
        const unsubscribe = bus.subscribe('a', handler);

        unsubscribe();
        await bus.publish(makeEvent('a'));

        expect(handler).not.toHaveBeenCalled();
    });
});
