import { randomUUID } from 'node:crypto';
import type { ApprovalRequestRepository } from '../../domain/approval/approval-request.repository.js';
import type { ServiceOrderRepository } from '../../domain/service-order/service-order.repository.js';
import type { BudgetRepository } from '../../domain/budget/budget.repository.js';
import type { OrderAwaitingApproval } from '../../domain/service-order/events/order-awaiting-approval.js';
import type { VehicleContactLookup } from '../ports/vehicle-contact.js';
import type { EmailSender } from '../ports/email-sender.js';
import { ApprovalRequest } from '../../domain/approval/approval-request.js';
import { generateApprovalToken } from '../../domain/approval/approval-token.js';
import { budgetVersion } from '../budget-version.js';
import { buildBudgetApprovalEmail } from '../notifications/budget-approval-email.js';
import { ApplicationException } from '../../../shared/application/application-exception.js';

export class ApprovalNotificationError extends ApplicationException {}

export class SendBudgetApprovalEmail {
    constructor(
        private readonly approvals: ApprovalRequestRepository,
        private readonly orders: ServiceOrderRepository,
        private readonly budgets: BudgetRepository,
        private readonly contacts: VehicleContactLookup,
        private readonly sender: EmailSender,
        private readonly frontendUrl: string,
        private readonly ttlMinutes: number,
        private readonly clock: () => Date = () => new Date(),
    ) {}

    async handle(event: OrderAwaitingApproval): Promise<void> {
        const order = await this.orders.findById(event.aggregateId);
        const budget = await this.budgets.findById(event.budgetId);
        if (
            !order ||
            !order.vehicleId ||
            order.status.value !== 'AWAITING_APPROVAL' ||
            !budget ||
            budget.serviceOrderId !== order.id.value ||
            budget.status.value !== 'PENDING'
        ) {
            throw new ApprovalNotificationError(
                'Order or pending budget unavailable for notification.',
            );
        }
        const contact = await this.contacts.findByVehicleId(order.vehicleId);
        if (!contact)
            throw new ApprovalNotificationError('Vehicle contact not found.');

        const now = this.clock();
        const { token, tokenHash } = generateApprovalToken();
        const request = ApprovalRequest.create(
            {
                id: randomUUID(),
                orderId: order.id.value,
                budgetId: budget.id.value,
                budgetVersion: budgetVersion(budget, order),
                tokenHash,
                expiresAt: new Date(now.getTime() + this.ttlMinutes * 60_000),
            },
            now,
        );
        await this.approvals.issue(request);
        const base = `${this.frontendUrl.replace(/\/$/, '')}/orcamento/${token}`;
        await this.sender.send(
            buildBudgetApprovalEmail({
                to: contact.email,
                name: contact.name,
                orderId: order.id.value,
                description: order.description,
                services: order.services,
                parts: order.items,
                totalCents: budget.totalCents,
                expiresAt: request.expiresAt,
                approveUrl: `${base}?acao=aprovar`,
                rejectUrl: `${base}?acao=recusar`,
            }),
        );
        await this.approvals.markSent(request.id);
    }
}
