import { and, asc, eq, inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { DomainEvent } from '../../../shared/domain/domain-event.js';
import { PartCode } from '../../../shared/domain/part-code.js';
import { PartSupplyId } from '../../../stock/domain/part-supply/part-supply-id.js';
import { PartSupply } from '../../../stock/domain/part-supply/part-supply.js';
import type { PartSupplyRepository } from '../../../stock/domain/part-supply/part-supply.repository.js';
import { Quantity } from '../../../stock/domain/part-supply/value-objects/quantity.js';
import { UnitOfMeasure } from '../../../stock/domain/part-supply/value-objects/unit-of-measure.js';
import { SupplyReservationId } from '../../../stock/domain/supply-reservation/supply-reservation-id.js';
import { SupplyReservation } from '../../../stock/domain/supply-reservation/supply-reservation.js';
import type { SupplyReservationRepository } from '../../../stock/domain/supply-reservation/supply-reservation.repository.js';
import { ReservationStatus } from '../../../stock/domain/supply-reservation/value-objects/reservation-status.js';
import {
    estoque,
    movimentoEstoque,
    pecaInsumo,
    reservaEstoque,
} from '../schema.js';

type Database = NodePgDatabase;

export class DrizzlePartSupplyRepository implements PartSupplyRepository {
    constructor(private readonly database: Database) {}

    async save(partSupply: PartSupply): Promise<void> {
        // Item, balance and movement history change together or not at all.
        await this.database.transaction(async (tx) => {
            const [current] = await tx
                .select()
                .from(pecaInsumo)
                .where(eq(pecaInsumo.stockId, partSupply.id.value))
                .limit(1);

            if (!current) {
                const [item] = await tx
                    .insert(pecaInsumo)
                    .values({
                        stockId: partSupply.id.value,
                        nome: partSupply.description.slice(0, 20),
                        descricao: partSupply.description,
                        valor: partSupply.unitPriceCents,
                        ativo: partSupply.active,
                        partCode: partSupply.partCode.value,
                        unitOfMeasure: partSupply.unitOfMeasure.value,
                        version: partSupply.version,
                    })
                    .returning({ itemId: pecaInsumo.itemId });

                if (!item) throw new Error('Part supply could not be inserted.');

                await tx.insert(estoque).values({
                    itemId: item.itemId,
                    quantidadeDisponivel: String(partSupply.quantity.value),
                });
                await saveMovements(tx, partSupply, item.itemId);
                return;
            }

            const updated = await tx
                .update(pecaInsumo)
                .set({
                    nome: partSupply.description.slice(0, 20),
                    descricao: partSupply.description,
                    valor: partSupply.unitPriceCents,
                    ativo: partSupply.active,
                    partCode: partSupply.partCode.value,
                    unitOfMeasure: partSupply.unitOfMeasure.value,
                    version: partSupply.version + 1,
                })
                .where(
                    and(
                        eq(pecaInsumo.itemId, current.itemId),
                        eq(pecaInsumo.version, partSupply.version),
                    ),
                )
                .returning({ itemId: pecaInsumo.itemId });

            if (!updated.length) {
                throw new Error(
                    `Optimistic locking failed for part supply ${partSupply.id.value}.`,
                );
            }

            const stockUpdated = await tx
                .update(estoque)
                .set({
                    quantidadeDisponivel: String(partSupply.quantity.value),
                })
                .where(eq(estoque.itemId, current.itemId))
                .returning({ itemId: estoque.itemId });

            if (!stockUpdated.length) {
                throw new Error(
                    `Stock balance not found for item ${current.itemId}.`,
                );
            }
            await saveMovements(tx, partSupply, current.itemId);
        });
    }

    async findById(id: PartSupplyId | string): Promise<PartSupply | null> {
        const [row] = await this.database
            .select({
                item: pecaInsumo,
                balance: estoque,
            })
            .from(pecaInsumo)
            .innerJoin(estoque, eq(estoque.itemId, pecaInsumo.itemId))
            .where(eq(pecaInsumo.stockId, typeof id === 'string' ? id : id.value))
            .limit(1);
        return row ? partSupplyFromRow(row.item, row.balance) : null;
    }

    async findByPartCode(
        partCode: PartCode | string,
    ): Promise<PartSupply | null> {
        const [row] = await this.database
            .select({
                item: pecaInsumo,
                balance: estoque,
            })
            .from(pecaInsumo)
            .innerJoin(estoque, eq(estoque.itemId, pecaInsumo.itemId))
            .where(
                eq(
                    pecaInsumo.partCode,
                    typeof partCode === 'string' ? partCode : partCode.value,
                ),
            )
            .limit(1);
        return row ? partSupplyFromRow(row.item, row.balance) : null;
    }


    async findAllActive(): Promise<PartSupply[]> {
        const rows = await this.database
            .select({ item: pecaInsumo, balance: estoque })
            .from(pecaInsumo)
            .innerJoin(estoque, eq(estoque.itemId, pecaInsumo.itemId))
            .where(eq(pecaInsumo.ativo, true))
            .orderBy(asc(pecaInsumo.partCode));
        return rows.map((row) => partSupplyFromRow(row.item, row.balance));
    }
}

async function saveMovements(
executor: Pick<Database, 'insert'>,
partSupply: PartSupply,
    itemId: number,
): Promise<void> {
    const movements = partSupply.pendingEvents.flatMap((event) => {
        if (isStockUpdatedEvent(event)) {
            return [
                {
                    itemId,
                    tipo:
                        event.movementType === 'ENTRY'
                            ? 'ENTRADA'
                            : 'SAIDA',
                    quantidade: String(event.movedQuantity),
                    observacao: `Motivo: ${event.reason}. Saldo: ${event.previousQuantity} -> ${event.currentQuantity}.`,
                },
            ];
        }

        if (isPartSupplyRegisteredEvent(event)) {
            return event.initialQuantity > 0
                ? [
                      {
                          itemId,
                          tipo: 'ENTRADA',
                          quantidade: String(event.initialQuantity),
                          observacao:
                              'Entrada inicial do cadastro do insumo.',
                      },
                  ]
                : [];
        }

        return [];
    });

    if (movements.length) {
        await executor.insert(movimentoEstoque).values(movements);
    }
}

export class DrizzleSupplyReservationRepository
    implements SupplyReservationRepository
{
    constructor(private readonly database: Database) {}

    async save(reservation: SupplyReservation): Promise<void> {
        const itemId = await this.findItemId(reservation.partSupplyId.value);
        if (itemId === null) {
            throw new Error(
                `Part supply ${reservation.partSupplyId.value} not found.`,
            );
        }

        const [current] = await this.database
            .select({ id: reservaEstoque.id })
            .from(reservaEstoque)
            .where(eq(reservaEstoque.id, reservation.id.value))
            .limit(1);

        if (!current) {
            await this.database.insert(reservaEstoque).values({
                id: reservation.id.value,
                itemId,
                serviceOrderId: reservation.serviceOrderId,
                quantity: reservation.quantity.value,
                status: reservation.status.value,
                version: reservation.version,
            });
            return;
        }

        const updated = await this.database
            .update(reservaEstoque)
            .set({
                status: reservation.status.value,
                version: reservation.version + 1,
            })
            .where(
                and(
                    eq(reservaEstoque.id, reservation.id.value),
                    eq(reservaEstoque.version, reservation.version),
                ),
            )
            .returning({ id: reservaEstoque.id });

        if (!updated.length) {
            throw new Error(
                `Optimistic locking failed for reservation ${reservation.id.value}.`,
            );
        }
    }

    async findById(
        id: SupplyReservationId | string,
    ): Promise<SupplyReservation | null> {
        const [row] = await this.database
            .select()
            .from(reservaEstoque)
            .innerJoin(
                pecaInsumo,
                eq(pecaInsumo.itemId, reservaEstoque.itemId),
            )
            .where(eq(reservaEstoque.id, typeof id === 'string' ? id : id.value))
            .limit(1);
        return row ? reservationFromRow(row.reserva_estoque, row.peca_insumo) : null;
    }

    async findByPartSupplyId(
        partSupplyId: PartSupplyId | string,
    ): Promise<SupplyReservation[]> {
        const itemId = await this.findItemId(
            typeof partSupplyId === 'string'
                ? partSupplyId
                : partSupplyId.value,
        );
        if (itemId === null) return [];
        const rows = await this.database
            .select()
            .from(reservaEstoque)
            .innerJoin(
                pecaInsumo,
                eq(pecaInsumo.itemId, reservaEstoque.itemId),
            )
            .where(eq(reservaEstoque.itemId, itemId));
        return rows.map((row) =>
            reservationFromRow(row.reserva_estoque, row.peca_insumo),
        );
    }

    async findByServiceOrderId(
        serviceOrderId: string,
    ): Promise<SupplyReservation[]> {
        const rows = await this.database
            .select()
            .from(reservaEstoque)
            .innerJoin(
                pecaInsumo,
                eq(pecaInsumo.itemId, reservaEstoque.itemId),
            )
            .where(eq(reservaEstoque.serviceOrderId, serviceOrderId));
        return rows.map((row) =>
            reservationFromRow(row.reserva_estoque, row.peca_insumo),
        );
    }

    async findByServiceOrderIdAndPartSupply(
        serviceOrderId: string,
        partSupplyId: PartSupplyId | string,
    ): Promise<SupplyReservation | null> {
        const itemId = await this.findItemId(
            typeof partSupplyId === 'string'
                ? partSupplyId
                : partSupplyId.value,
        );
        if (itemId === null) return null;
        const rows = await this.database
            .select()
            .from(reservaEstoque)
            .innerJoin(
                pecaInsumo,
                eq(pecaInsumo.itemId, reservaEstoque.itemId),
            )
            .where(
                and(
                    eq(reservaEstoque.serviceOrderId, serviceOrderId),
                    eq(reservaEstoque.itemId, itemId),
                    inArray(reservaEstoque.status, ['PENDING', 'CONFIRMED']),
                ),
            )
            .limit(1);
        return rows[0]
            ? reservationFromRow(
                  rows[0].reserva_estoque,
                  rows[0].peca_insumo,
              )
            : null;
    }

    private async findItemId(stockId: string): Promise<number | null> {
        const [row] = await this.database
            .select({ itemId: pecaInsumo.itemId })
            .from(pecaInsumo)
            .where(eq(pecaInsumo.stockId, stockId))
            .limit(1);
        return row?.itemId ?? null;
    }
}

type StockUpdatedEvent = DomainEvent & {
    eventName: 'stock.stock-updated';
    partCode: string;
    movementType: 'ENTRY' | 'EXIT';
    reason: string;
    movedQuantity: number;
    previousQuantity: number;
    currentQuantity: number;
};

type PartSupplyRegisteredEvent = DomainEvent & {
    eventName: 'stock.part-supply-registered';
    initialQuantity: number;
};

function isStockUpdatedEvent(
    event: DomainEvent,
): event is StockUpdatedEvent {
    return event.eventName === 'stock.stock-updated';
}

function isPartSupplyRegisteredEvent(
    event: DomainEvent,
): event is PartSupplyRegisteredEvent {
    return event.eventName === 'stock.part-supply-registered';
}

function partSupplyFromRow(
    item: typeof pecaInsumo.$inferSelect,
    balance: typeof estoque.$inferSelect,
): PartSupply {
    const quantity = Number(balance.quantidadeDisponivel);
    if (!Number.isInteger(quantity)) {
        throw new Error(
            `Stock quantity for item ${item.itemId} is not an integer.`,
        );
    }
    return PartSupply.create({
        id: new PartSupplyId(item.stockId),
        description: item.descricao ?? item.nome,
        partCode: PartCode.create(item.partCode),
        quantity: Quantity.create(quantity),
        unitOfMeasure: UnitOfMeasure.create(item.unitOfMeasure),
        unitPriceCents: item.valor,
        active: item.ativo,
        version: item.version,
    });
}

function reservationFromRow(
    row: typeof reservaEstoque.$inferSelect,
    item: typeof pecaInsumo.$inferSelect,
): SupplyReservation {
    return SupplyReservation.create({
        id: new SupplyReservationId(row.id),
        partSupplyId: new PartSupplyId(item.stockId),
        serviceOrderId: row.serviceOrderId,
        quantity: Quantity.create(row.quantity),
        status: ReservationStatus.create(row.status),
        version: row.version,
    });
}
