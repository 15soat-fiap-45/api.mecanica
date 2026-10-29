import type { ApprovalRequestRepository } from '../../domain/approval/approval-request.repository.js';
import type { ApprovalDecision } from '../../domain/approval/approval-request.js';
import type { ServiceOrderRepository } from '../../domain/service-order/service-order.repository.js';
import type { BudgetRepository } from '../../domain/budget/budget.repository.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import { ApplicationException } from '../../../shared/application/application-exception.js';
import { hashApprovalToken } from '../../domain/approval/approval-token.js';
import { budgetVersion } from '../budget-version.js';

export class InvalidApprovalTokenError extends ApplicationException {
    constructor() {
        super('Invalid or expired approval link.');
    }
}

export class BudgetChangedError extends ApplicationException {
    constructor() {
        super('Budget changed. Request a new approval link.');
    }
}

export class DecideBudgetApproval {
    constructor(
        private readonly approvals: ApprovalRequestRepository,
        private readonly orders: ServiceOrderRepository,
        private readonly budgets: BudgetRepository,
        private readonly bus: EventBus,
        private readonly clock: () => Date = () => new Date(),
    ) {}

    async execute(input: {
        token: string;
        decision: ApprovalDecision;
        rejectionReason?: string | undefined;
    }): Promise<{
        status: 'decided' | 'already_decided';
        decision: ApprovalDecision;
    }> {
        if (!/^[A-Za-z0-9_-]{43}$/.test(input.token))
            throw new InvalidApprovalTokenError();
        const request = await this.approvals.findByTokenHash(
            hashApprovalToken(input.token),
        );
        if (!request) throw new InvalidApprovalTokenError();
        if (request.usedAt) {
            if (request.decision === input.decision)
                return { status: 'already_decided', decision: input.decision };
            throw new InvalidApprovalTokenError();
        }
        const now = this.clock();
        if (!request.isActive(now)) throw new InvalidApprovalTokenError();
        const [order, budget] = await Promise.all([
            this.orders.findById(request.orderId),
            this.budgets.findById(request.budgetId),
        ]);
        if (
            !order ||
            !budget ||
            order.status.value !== 'AWAITING_APPROVAL' ||
            budget.status.value !== 'PENDING' ||
            budget.serviceOrderId !== order.id.value
        ) {
            throw new InvalidApprovalTokenError();
        }
        if (budgetVersion(budget, order) !== request.budgetVersion)
            throw new BudgetChangedError();
        request.decide(input.decision, now, input.rejectionReason);
        if (input.decision === 'approved') budget.approve();
        else budget.reject();
        await this.approvals.decide(request, budget, order.version);
        await this.bus.publish(budget.pullEvents());
        return { status: 'decided', decision: input.decision };
    }
}
