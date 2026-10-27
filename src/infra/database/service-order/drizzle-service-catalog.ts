import { asc, eq, inArray, sql } from 'drizzle-orm';
import type {
    CatalogService,
    ServiceCatalog,
} from '../../../service-order/application/ports/service-catalog.js';
import { ApplicationException } from '../../../shared/application/application-exception.js';
import { db } from '../connection.js';
import {
    catalogServices,
    orderServices,
    serviceOrders,
    serviceParts,
} from '../schema.js';

export class InvalidCatalogServiceError extends ApplicationException {}
export class ServiceAlreadyAssignedError extends ApplicationException {}

export class DrizzleServiceCatalog implements ServiceCatalog {
    constructor(private readonly database: typeof db = db) {}

    async create(input: Omit<CatalogService, 'id'>): Promise<CatalogService> {
        if (
            !input.title.trim() ||
            input.title.length > 20 ||
            (input.description?.length ?? 0) > 200 ||
            !Number.isSafeInteger(input.valueCents) ||
            input.valueCents < 0 ||
            input.partIds.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
            new Set(input.partIds).size !== input.partIds.length
        ) {
            throw new InvalidCatalogServiceError(
                'Invalid service or part IDs.',
            );
        }
        const id = await this.database.transaction(async (tx) => {
            if (input.partIds.length) {
                const parts = await tx.execute<{ item_id: string }>(sql`
                    SELECT item_id FROM peca_insumo
                    WHERE item_id IN (${sql.join(
                        input.partIds.map((id) => sql`${id}`),
                        sql`, `,
                    )})
                `);
                if (parts.rows.length !== input.partIds.length)
                    throw new InvalidCatalogServiceError('Part not found.');
            }
            const [service] = await tx
                .insert(catalogServices)
                .values({
                    title: input.title.trim(),
                    description: input.description,
                    valueCents: input.valueCents,
                })
                .returning({ id: catalogServices.id });
            if (!service)
                throw new InvalidCatalogServiceError(
                    'Service could not be saved.',
                );
            if (input.partIds.length)
                await tx.insert(serviceParts).values(
                    input.partIds.map((partId) => ({
                        serviceId: service.id,
                        partId,
                    })),
                );
            return service.id;
        });
        return { ...input, id, title: input.title.trim() };
    }

    async list(): Promise<CatalogService[]> {
        const rows = await this.database
            .select()
            .from(catalogServices)
            .orderBy(asc(catalogServices.id));
        const parts = rows.length
            ? await this.database
                  .select()
                  .from(serviceParts)
                  .where(
                      inArray(
                          serviceParts.serviceId,
                          rows.map((row) => row.id),
                      ),
                  )
            : [];
        return rows.map((row) => ({
            id: row.id,
            title: row.title,
            description: row.description,
            valueCents: row.valueCents,
            partIds: parts
                .filter((part) => part.serviceId === row.id)
                .map((part) => part.partId),
        }));
    }

    async assign(orderId: string, serviceId: number): Promise<void> {
        await this.database.transaction(async (tx) => {
            const [order] = await tx
                .select({ status: serviceOrders.status })
                .from(serviceOrders)
                .where(eq(serviceOrders.id, orderId))
                .for('update')
                .limit(1);
            if (!order || order.status !== 'PENDING')
                throw new InvalidCatalogServiceError(
                    'Only pending orders may add services.',
                );
            const [service] = await tx
                .select()
                .from(catalogServices)
                .where(eq(catalogServices.id, serviceId))
                .limit(1);
            if (!service)
                throw new InvalidCatalogServiceError('Service not found.');
            const [saved] = await tx
                .insert(orderServices)
                .values({
                    orderId,
                    serviceId,
                    title: service.title,
                    valueCents: service.valueCents,
                })
                .onConflictDoNothing()
                .returning({ serviceId: orderServices.serviceId });
            if (!saved)
                throw new ServiceAlreadyAssignedError(
                    'Service is already assigned.',
                );
            await tx
                .update(serviceOrders)
                .set({
                    version: sql`${serviceOrders.version} + 1`,
                })
                .where(eq(serviceOrders.id, orderId));
        });
    }

    async forOrder(orderId: string): Promise<CatalogService[]> {
        const rows = await this.database
            .select()
            .from(orderServices)
            .where(eq(orderServices.orderId, orderId))
            .orderBy(asc(orderServices.serviceId));
        const parts = rows.length
            ? await this.database
                  .select()
                  .from(serviceParts)
                  .where(
                      inArray(
                          serviceParts.serviceId,
                          rows.map((row) => row.serviceId),
                      ),
                  )
            : [];
        return rows.map((row) => ({
            id: row.serviceId,
            title: row.title,
            valueCents: row.valueCents,
            description: null,
            partIds: parts
                .filter((part) => part.serviceId === row.serviceId)
                .map((part) => part.partId),
        }));
    }
}
