import type { PartSupplyRepository } from '../../domain/part-supply/part-supply.repository.js';
import type { SupplyReservationRepository } from '../../domain/supply-reservation/supply-reservation.repository.js';
import { SupplyReservation } from '../../domain/supply-reservation/supply-reservation.js';
import { PartCode } from '../../domain/part-supply/value-objects/part-code.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import type { UseCase } from '../../../shared/application/use-case.js';
import { ApplicationException } from '../../../shared/application/application-exception.js';

export class PartSupplyNotFoundError extends ApplicationException {
    constructor() {
        super('Part/Supply not found.');
    }
}

export interface ReserveSupplyInput {
    serviceOrderId: string;
    partCode: string;
    quantity: number;
}

export interface ReserveSupplyOutput {
    id: string;
    partSupplyId: string;
    partCode: string;
    quantity: number;
    status: string;
    availableQuantity: number;
}

export class ReserveSupply implements UseCase<
    ReserveSupplyInput,
    ReserveSupplyOutput
> {
    constructor(
        private readonly partSupplyRepository: PartSupplyRepository,
        private readonly reservationRepository: SupplyReservationRepository,
        private readonly eventBus?: EventBus,
    ) {}

    async execute(input: ReserveSupplyInput): Promise<ReserveSupplyOutput> {
        const partCode = PartCode.create(input.partCode);

        const partSupply =
            await this.partSupplyRepository.findByPartCode(partCode);
        if (!partSupply) {
            throw new PartSupplyNotFoundError();
        }

        // Idempotency: the event may be delivered twice — the same service
        // order and the same supply must not be reserved twice.
        const existingReservation =
            await this.reservationRepository.findByServiceOrderIdAndPartSupply(
                input.serviceOrderId,
                partSupply.id,
            );
        if (existingReservation) {
            return {
                id: existingReservation.id.value,
                partSupplyId: partSupply.id.value,
                partCode: partSupply.partCode.value,
                quantity: existingReservation.quantity.value,
                status: existingReservation.status.value,
                availableQuantity: partSupply.quantity.value,
            };
        }

        // The reservation takes the quantity out of the available stock.
        partSupply.deduct(input.quantity);

        const reservation = SupplyReservation.create({
            partSupplyId: partSupply.id,
            serviceOrderId: input.serviceOrderId,
            quantity: input.quantity,
        });

        await this.partSupplyRepository.save(partSupply);
        await this.reservationRepository.save(reservation);

        if (this.eventBus) {
            await this.eventBus.publish(partSupply.pullEvents());
        }

        return {
            id: reservation.id.value,
            partSupplyId: partSupply.id.value,
            partCode: partSupply.partCode.value,
            quantity: reservation.quantity.value,
            status: reservation.status.value,
            availableQuantity: partSupply.quantity.value,
        };
    }
}
