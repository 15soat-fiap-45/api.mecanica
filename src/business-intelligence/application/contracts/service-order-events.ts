import type { DomainEvent } from '../../../shared/domain/domain-event.js';

/**
 * Local consumer-driven contracts for events published by the Service Order
 * context. Declared inside the BI context so both bounded contexts remain
 * decoupled without cross-importing domain classes.
 */
export interface ServiceOrderRegisteredContract extends DomainEvent {
    readonly eventName: 'service-order.registered';
}

export interface ServiceOrderExecutionStartedContract extends DomainEvent {
    readonly eventName: 'service-order.execution-started';
}

export interface ServiceOrderFinishedContract extends DomainEvent {
    readonly eventName: 'service-order.finished';
}

export interface ServiceOrderDeliveredContract extends DomainEvent {
    readonly eventName: 'service-order.delivered';
}

export interface ServiceOrderCancelledContract extends DomainEvent {
    readonly eventName: 'service-order.cancelled';
}
