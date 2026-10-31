import type { UseCase } from '../../../shared/application/use-case.js';
import type { ServiceOrderRepository } from '../../domain/service-order/service-order.repository.js';
import { ServiceOrderStatus } from '../../domain/service-order/value-objects/service-order-status.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface ListServiceOrdersInput {
    statuses?: string[] | undefined;
    vehicleId?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
}

export interface ServiceOrderSummary {
    id: string;
    vehicleId: string | null;
    description: string;
    status: string;
    openedAt: string | null;
    totalCents: number;
}

export interface ListServiceOrdersOutput {
    items: ServiceOrderSummary[];
    total: number;
    limit: number;
    offset: number;
}

/** Listagem administrativa das OS, com filtros e paginação. */
export class ListServiceOrders implements UseCase<
    ListServiceOrdersInput,
    ListServiceOrdersOutput
> {
    constructor(private readonly orders: ServiceOrderRepository) {}

    async execute(
        input: ListServiceOrdersInput,
    ): Promise<ListServiceOrdersOutput> {
        const limit = Math.min(
            Math.max(Math.trunc(input.limit ?? DEFAULT_PAGE_SIZE), 1),
            MAX_PAGE_SIZE,
        );
        const offset = Math.max(Math.trunc(input.offset ?? 0), 0);
        const statuses = input.statuses?.length
            ? [
                  ...new Set(
                      input.statuses.map(
                          (s) => ServiceOrderStatus.create(s).value,
                      ),
                  ),
              ]
            : undefined;

        const page = (await this.orders.list?.({
            statuses,
            vehicleId: input.vehicleId,
            limit,
            offset,
        })) ?? { items: [], total: 0 };

        return {
            items: page.items.map(({ order, openedAt }) => ({
                id: order.id.value,
                vehicleId: order.vehicleId,
                description: order.description,
                status: order.status.value,
                openedAt: openedAt?.toISOString() ?? null,
                totalCents: order.totalCents,
            })),
            total: page.total,
            limit,
            offset,
        };
    }
}
