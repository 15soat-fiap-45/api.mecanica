import { DomainException } from '../../../shared/domain/domain-exception.js';

export type ApprovalDecision = 'approved' | 'rejected';

export class InvalidApprovalRequestError extends DomainException {}

export interface ApprovalRequestProps {
    id: string;
    orderId: string;
    budgetId: string;
    budgetVersion: string;
    tokenHash: string;
    expiresAt: Date;
    createdAt: Date;
    usedAt: Date | null;
    revokedAt: Date | null;
    decision: ApprovalDecision | null;
    rejectionReason: string | null;
    sentAt: Date | null;
}

export class ApprovalRequest {
    private constructor(private readonly props: ApprovalRequestProps) {}

    static create(
        props: Omit<
            ApprovalRequestProps,
            | 'createdAt'
            | 'usedAt'
            | 'revokedAt'
            | 'decision'
            | 'rejectionReason'
            | 'sentAt'
        >,
        now: Date,
    ): ApprovalRequest {
        if (props.expiresAt <= now)
            throw new InvalidApprovalRequestError(
                'Approval expiration must be in the future',
            );
        return new ApprovalRequest({
            ...props,
            createdAt: now,
            usedAt: null,
            revokedAt: null,
            decision: null,
            rejectionReason: null,
            sentAt: null,
        });
    }

    static restore(props: ApprovalRequestProps): ApprovalRequest {
        return new ApprovalRequest(props);
    }

    get id() {
        return this.props.id;
    }
    get orderId() {
        return this.props.orderId;
    }
    get budgetId() {
        return this.props.budgetId;
    }
    get budgetVersion() {
        return this.props.budgetVersion;
    }
    get tokenHash() {
        return this.props.tokenHash;
    }
    get expiresAt() {
        return this.props.expiresAt;
    }
    get decision() {
        return this.props.decision;
    }
    get sentAt() {
        return this.props.sentAt;
    }
    get usedAt() {
        return this.props.usedAt;
    }

    isActive(now: Date): boolean {
        return (
            !this.props.usedAt &&
            !this.props.revokedAt &&
            now < this.props.expiresAt
        );
    }

    revoke(now: Date): void {
        if (!this.props.usedAt) this.props.revokedAt = now;
    }

    markSent(now: Date): void {
        this.props.sentAt = now;
    }

    decide(
        decision: ApprovalDecision,
        now: Date,
        rejectionReason?: string,
    ): void {
        if (!this.isActive(now))
            throw new InvalidApprovalRequestError(
                'Approval request is no longer active',
            );
        this.props.decision = decision;
        this.props.usedAt = now;
        this.props.rejectionReason =
            decision === 'rejected' ? rejectionReason?.trim() || null : null;
    }

    toPersistence(): ApprovalRequestProps {
        return { ...this.props };
    }
}
