import type { ServiceOrderFinished } from '../../domain/service-order/events/service-order-finished.js';
import type { ServiceOrderRepository } from '../../domain/service-order/service-order.repository.js';
import type { VehicleContactLookup } from '../ports/vehicle-contact.js';
import type { EmailSender } from '../ports/email-sender.js';
import { escapeHtml } from '../notifications/budget-approval-email.js';
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
        await this.sender.send({
            to: contact.email,
            subject: `Veículo pronto para retirada - OS ${order.id.value}`,
            html: `<!doctype html><html lang="pt-BR"><body><p>Olá, ${escapeHtml(contact.name)}.</p><p>O veículo da OS ${escapeHtml(order.id.value)} está pronto para retirada.</p></body></html>`,
            text: `Olá, ${contact.name}.\nO veículo da OS ${order.id.value} está pronto para retirada.`,
        });
    }
}
