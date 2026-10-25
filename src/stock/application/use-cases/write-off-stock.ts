import type { SupplyReservationRepository } from '../../domain/supply-reservation/supply-reservation.repository.js';
import type { UseCase } from '../../../shared/application/use-case.js';

export interface WriteOffStockInput {
    serviceOrderId: string;
}

export interface WrittenOffItem {
    reservationId: string;
    partSupplyId: string;
    quantity: number;
    status: string;
}

export interface WriteOffStockOutput {
    serviceOrderId: string;
    writtenOffItems: WrittenOffItem[];
}

/**
 * Writes off the stock for good by consuming the service order's
 * reservations. The quantity already left the available stock when the
 * reservation was made; the write-off only confirms the consumption.
 *
 * Idempotent: reservations already CONSUMED or CANCELLED are skipped, so
 * the "service order finished" event may be delivered twice with no side
 * effects.
 */
export class WriteOffStock implements UseCase<
    WriteOffStockInput,
    WriteOffStockOutput
> {
    constructor(
        private readonly reservationRepository: SupplyReservationRepository,
    ) {}

    async execute(input: WriteOffStockInput): Promise<WriteOffStockOutput> {
        const reservations =
            await this.reservationRepository.findByServiceOrderId(
                input.serviceOrderId,
            );

        const writtenOffItems: WrittenOffItem[] = [];

        for (const reservation of reservations) {
            if (
                reservation.status.value === 'CONSUMED' ||
                reservation.status.value === 'CANCELLED'
            ) {
                continue;
            }

            if (reservation.status.value === 'PENDING') {
                reservation.confirm();
            }
            reservation.consume();

            await this.reservationRepository.save(reservation);

            writtenOffItems.push({
                reservationId: reservation.id.value,
                partSupplyId: reservation.partSupplyId.value,
                quantity: reservation.quantity.value,
                status: reservation.status.value,
            });
        }

        return {
            serviceOrderId: input.serviceOrderId,
            writtenOffItems,
        };
    }
}
