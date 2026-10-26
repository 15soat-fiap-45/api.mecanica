import { and, eq, gt, isNull, lte, sql } from 'drizzle-orm';
import type { ApprovalRequestRepository } from '../../../service-order/domain/approval/approval-request.repository.js';
import { ApprovalRequest } from '../../../service-order/domain/approval/approval-request.js';
import type { Budget } from '../../../service-order/domain/budget/budget.js';
import { db } from '../connection.js';
import { approvalRequests, budgets, serviceOrders } from '../schema.js';
import { ConcurrentModificationError } from './concurrent-modification-error.js';

export class DrizzleApprovalRequestRepository implements ApprovalRequestRepository {
    constructor(private readonly database: typeof db = db) {}

    async issue(request: ApprovalRequest): Promise<void> {
        await this.database.transaction(async (tx) => {
            await tx
                .update(approvalRequests)
                .set({ revokedAt: request.toPersistence().createdAt })
                .where(
                    and(
                        eq(approvalRequests.orderId, request.orderId),
                        isNull(approvalRequests.usedAt),
                        isNull(approvalRequests.revokedAt),
                    ),
                );
            await tx.insert(approvalRequests).values(request.toPersistence());
        });
    }

    async markSent(id: string): Promise<void> {
        await this.database
            .update(approvalRequests)
            .set({ sentAt: new Date() })
            .where(
                and(
                    eq(approvalRequests.id, id),
                    isNull(approvalRequests.revokedAt),
                    isNull(approvalRequests.usedAt),
                ),
            );
    }

    async findByTokenHash(hash: string): Promise<ApprovalRequest | null> {
        const [row] = await this.database
            .select()
            .from(approvalRequests)
            .where(eq(approvalRequests.tokenHash, hash))
            .limit(1);
        return row
            ? ApprovalRequest.restore({
                  ...row,
                  decision:
                      row.decision === 'approved' || row.decision === 'rejected'
                          ? row.decision
                          : null,
              })
            : null;
    }

    async decide(
        request: ApprovalRequest,
        budget: Budget,
        orderVersion: number,
    ): Promise<void> {
        const props = request.toPersistence();
        await this.database.transaction(async (tx) => {
            const [order] = await tx
                .select({
                    id: serviceOrders.id,
                    version: serviceOrders.version,
                })
                .from(serviceOrders)
                .where(
                    and(
                        eq(serviceOrders.id, request.orderId),
                        eq(serviceOrders.status, 'AWAITING_APPROVAL'),
                    ),
                )
                .for('update')
                .limit(1);
            if (!order || order.version !== orderVersion)
                throw new ConcurrentModificationError();
            const [claimed] = await tx
                .update(approvalRequests)
                .set({
                    usedAt: props.usedAt,
                    decision: props.decision,
                    rejectionReason: props.rejectionReason,
                })
                .where(
                    and(
                        eq(approvalRequests.id, request.id),
                        isNull(approvalRequests.usedAt),
                        isNull(approvalRequests.revokedAt),
                        gt(approvalRequests.expiresAt, props.usedAt!),
                    ),
                )
                .returning({ id: approvalRequests.id });
            if (!claimed) throw new ConcurrentModificationError();
            const [saved] = await tx
                .update(budgets)
                .set({
                    status: budget.status.value,
                    version: sql`${budgets.version} + 1`,
                })
                .where(
                    and(
                        eq(budgets.id, request.budgetId),
                        eq(budgets.serviceOrderId, request.orderId),
                        eq(budgets.version, budget.version),
                        eq(budgets.status, 'PENDING'),
                    ),
                )
                .returning({ id: budgets.id });
            if (!saved) throw new ConcurrentModificationError();
            if (props.decision === 'rejected') {
                const [rejected] = await tx
                    .update(serviceOrders)
                    .set({
                        status: 'REJECTED',
                        version: sql`${serviceOrders.version} + 1`,
                    })
                    .where(
                        and(
                            eq(serviceOrders.id, request.orderId),
                            eq(serviceOrders.status, 'AWAITING_APPROVAL'),
                            eq(serviceOrders.version, orderVersion),
                        ),
                    )
                    .returning({ id: serviceOrders.id });
                if (!rejected) throw new ConcurrentModificationError();
            }
        });
        budget.markPersisted();
    }

    async expirePending(now: Date): Promise<number> {
        const pending = await this.database
            .select({
                id: approvalRequests.id,
                orderId: approvalRequests.orderId,
                budgetId: approvalRequests.budgetId,
            })
            .from(approvalRequests)
            .where(
                and(
                    isNull(approvalRequests.usedAt),
                    isNull(approvalRequests.revokedAt),
                    lte(approvalRequests.expiresAt, now),
                ),
            )
            .limit(100);
        let expired = 0;
        for (const request of pending) {
            const changed = await this.database.transaction(async (tx) => {
                const [order] = await tx
                    .select({ id: serviceOrders.id })
                    .from(serviceOrders)
                    .where(
                        and(
                            eq(serviceOrders.id, request.orderId),
                            eq(serviceOrders.status, 'AWAITING_APPROVAL'),
                        ),
                    )
                    .for('update', { skipLocked: true })
                    .limit(1);
                if (!order) return false;
                const [approval] = await tx
                    .select({
                        id: approvalRequests.id,
                        expiresAt: approvalRequests.expiresAt,
                        usedAt: approvalRequests.usedAt,
                        revokedAt: approvalRequests.revokedAt,
                    })
                    .from(approvalRequests)
                    .where(eq(approvalRequests.id, request.id))
                    .for('update')
                    .limit(1);
                if (
                    !approval ||
                    approval.usedAt ||
                    approval.revokedAt ||
                    approval.expiresAt > now
                )
                    return false;
                const [budget] = await tx
                    .update(budgets)
                    .set({
                        status: 'REJECTED',
                        version: sql`${budgets.version} + 1`,
                    })
                    .where(
                        and(
                            eq(budgets.id, request.budgetId),
                            eq(budgets.status, 'PENDING'),
                        ),
                    )
                    .returning({ id: budgets.id });
                if (!budget) return false;
                await tx
                    .update(serviceOrders)
                    .set({
                        status: 'REJECTED',
                        version: sql`${serviceOrders.version} + 1`,
                    })
                    .where(eq(serviceOrders.id, request.orderId));
                await tx
                    .update(approvalRequests)
                    .set({
                        decision: 'rejected',
                        usedAt: now,
                    })
                    .where(eq(approvalRequests.id, request.id));
                return true;
            });
            if (changed) expired++;
        }
        return expired;
    }
}
