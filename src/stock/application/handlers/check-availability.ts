import { BaseDomainEvent } from '../../../shared/domain/domain-event.js';
import type { DomainEvent } from '../../../shared/domain/domain-event.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import { InsufficientQuantityException } from '../../domain/part-supply/value-objects/quantity.js';
import {
    PartSupplyNotFoundError,
    ReserveSupply,
} from '../use-cases/reserve-supply.js';

/**
 * The service order event contract is declared in the Stock context
 * itself — the consumer defines the format it expects without importing
 * anything from the Service Order domain. Both contexts stay decoupled.
 */
export interface IncludedSupplyItem {
    readonly partCode: string;
    readonly quantity: number;
}

export interface AdditionalSuppliesIncluded extends DomainEvent {
    readonly eventName: 'service-order.additional-supplies-included';
    readonly items: readonly IncludedSupplyItem[];
}

export interface ItemAwaitingReplenishment {
    readonly partCode: string;
    readonly requestedQuantity: number;
}

export interface AwaitingReplenishmentProps {
    aggregateId: string;
    pendingItems: ItemAwaitingReplenishment[];
}

/** Event published so the service order waits for supply replenishment. */
export class AwaitingReplenishment extends BaseDomainEvent {
    readonly eventName = 'stock.awaiting-replenishment';
    readonly pendingItems: ItemAwaitingReplenishment[];

    constructor(props: AwaitingReplenishmentProps) {
        super(props.aggregateId);
        this.pendingItems = props.pendingItems;
        Object.freeze(this);
    }
}

/**
 * Handler for the service order's "additional supplies included" event.
 *
 * Tries to reserve each item; if there is no stock, publishes
 * AwaitingReplenishment so the service order waits for replenishment.
 *
 * Runs in its own transaction: consistency between contexts is eventual
 * (there is a gap between the service order recording the supply and the
 * Stock context reserving it). Idempotency is enforced by the
 * ReserveSupply use case (service order + supply key).
 */
export class CheckAvailability {
    constructor(
        private readonly reserveSupply: ReserveSupply,
        private readonly eventBus: EventBus,
    ) {}

    async handle(event: AdditionalSuppliesIncluded): Promise<void> {
        const pendingItems: ItemAwaitingReplenishment[] = [];

        for (const item of event.items) {
            try {
                await this.reserveSupply.execute({
                    serviceOrderId: event.aggregateId,
                    partCode: item.partCode,
                    quantity: item.quantity,
                });
            } catch (error) {
                if (
                    error instanceof PartSupplyNotFoundError ||
                    error instanceof InsufficientQuantityException
                ) {
                    pendingItems.push({
                        partCode: item.partCode,
                        requestedQuantity: item.quantity,
                    });
                    continue;
                }
                throw error;
            }
        }

        if (pendingItems.length > 0) {
            await this.eventBus.publish(
                new AwaitingReplenishment({
                    aggregateId: event.aggregateId,
                    pendingItems,
                }),
            );
        }
    }
}
