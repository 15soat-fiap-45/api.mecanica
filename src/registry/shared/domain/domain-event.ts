export interface DomainEvent {
    readonly eventId: string;
    readonly eventName: string; // ex.: 'cadastro.cliente-cadastrado'
    readonly occurredOn: Date;
    readonly aggregateId: string;
}

export abstract class BaseDomainEvent implements DomainEvent {
    readonly eventId = crypto.randomUUID();
    readonly occurredOn = new Date();
    abstract readonly eventName: string;

    protected constructor(readonly aggregateId: string) {}
}
