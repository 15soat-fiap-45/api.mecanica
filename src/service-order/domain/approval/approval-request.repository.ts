import type { ApprovalRequest } from './approval-request.js';
import type { Budget } from '../budget/budget.js';

export interface ApprovalRequestRepository {
    issue(request: ApprovalRequest): Promise<void>;
    markSent(id: string): Promise<void>;
    findByTokenHash(hash: string): Promise<ApprovalRequest | null>;
    decide(
        request: ApprovalRequest,
        budget: Budget,
        orderVersion: number,
    ): Promise<void>;
    expirePending(now: Date): Promise<number>;
}
