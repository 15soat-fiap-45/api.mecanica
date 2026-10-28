import type { ServiceOrderFinished } from '../../domain/service-order/events/service-order-finished.js';
import type { ServiceOrderRepository } from '../../domain/service-order/service-order.repository.js';
import type { VehicleContactLookup } from '../ports/vehicle-contact.js';
import type { EmailSender } from '../ports/email-sender.js';
import { buildVehicleReadyEmail } from '../notifications/vehicle-ready-email.js';
import { ApprovalNotificationError } from './send-budget-approval-email.js';

export class SendVehicleReadyEmail {
    constructor(
        private readonly orders: ServiceOrderRepository,
        private readonly contacts: VehicleContactLookup,
        private readonly sender: EmailSender,
    ) {}

    async handle(event: ServiceOrderFinished): Promise<void> {
        const order = await this.orders.findById(event.aggregateId);
        if (
            !order?.vehicleId ||
            !['COMPLETED', 'DELIVERED'].includes(order.status.value)
        ) {
            throw new ApprovalNotificationError(
                'Completed order or vehicle not found.',
            );
        }
        const contact = await this.contacts.findByVehicleId(order.vehicleId);
        if (!contact)
            throw new ApprovalNotificationError('Vehicle contact not found.');
        await this.sender.send(
            buildVehicleReadyEmail({
                to: contact.email,
                name: contact.name,
                orderId: order.id.value,
                description: order.description,
            }),
        );
    }
}
