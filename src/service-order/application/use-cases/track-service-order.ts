import type { UseCase } from '../../../shared/application/use-case.js';
import type { ServiceOrderRepository } from '../../domain/service-order/service-order.repository.js';
import type { VehicleContactLookup } from '../ports/vehicle-contact.js';
import { ServiceOrderNotFoundError } from './add-supply-to-service-order.js';

export interface TrackServiceOrderInput {
    serviceOrderId: string;
    document: string;
}

export interface TrackServiceOrderOutput {
    serviceOrderId: string;
    description: string;
    status: string;
    totalCents: number;
    history: { status: string; recordedAt: string }[];
}

const onlyDigits = (value: string) => value.replace(/\D/g, '');

/**
 * Consulta de andamento feita pelo próprio cliente. A OS só é revelada quando
 * o CPF/CNPJ informado é o do titular do veículo; caso contrário responde como
 * inexistente, para não confirmar a existência de OS de terceiros.
 */
export class TrackServiceOrder implements UseCase<
    TrackServiceOrderInput,
    TrackServiceOrderOutput
> {
    constructor(
        private readonly orders: ServiceOrderRepository,
        private readonly contacts: VehicleContactLookup,
    ) {}

    async execute(
        input: TrackServiceOrderInput,
    ): Promise<TrackServiceOrderOutput> {
        const order = await this.orders.findById(input.serviceOrderId);
        if (!order?.vehicleId) throw new ServiceOrderNotFoundError();
        const contact = await this.contacts.findByVehicleId(order.vehicleId);
        const document = onlyDigits(input.document);
        if (
            !contact ||
            !document ||
            onlyDigits(contact.customerDocument) !== document
        ) {
            throw new ServiceOrderNotFoundError();
        }
        const entries =
            (await this.orders.findStatusHistory?.(order.id.value)) ?? [];
        return {
            serviceOrderId: order.id.value,
            description: order.description,
            status: order.status.value,
            totalCents: order.totalCents,
            history: entries.map((entry) => ({
                status: entry.status,
                recordedAt: entry.recordedAt.toISOString(),
            })),
        };
    }
}
