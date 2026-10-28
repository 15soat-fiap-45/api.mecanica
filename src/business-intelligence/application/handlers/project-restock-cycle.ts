import { RestockCycle } from '../../domain/restock-cycle/restock-cycle.js';
import type { RestockCyclePolicy } from '../../domain/restock-cycle/restock-cycle-policy.js';
import type { RestockCycleRepository } from '../../domain/restock-cycle/restock-cycle.repository.js';
import type { StockMovement } from '../../domain/restock-cycle/stock-movement.js';

/**
 * Projects stock movements into replenishment cycles according to the
 * injected `RestockCyclePolicy`.
 *
 * - At most one open cycle exists per `partCode`: further outward movements
 *   while a cycle is already open are ignored.
 * - An inward movement that satisfies `policy.closesCycle` closes the open
 *   cycle (if any); otherwise it is a no-op.
 * - A movement that satisfies `policy.voidsCycle` discards the open cycle,
 *   so it never counts towards the restock lead time.
 */
export class ProjectRestockCycle {
    constructor(
        private readonly cycles: RestockCycleRepository,
        private readonly policy: RestockCyclePolicy,
    ) {}

    async handle(movement: StockMovement): Promise<void> {
        const open = await this.cycles.findOpenByPartCode(movement.partCode);

        if (!open) {
            if (!this.policy.opensCycle(movement)) return;
            const cycle = RestockCycle.open({
                partCode: movement.partCode,
                openedAt: movement.occurredOn,
                quantityAtOpen: movement.quantityAfter,
            });
            await this.cycles.save(cycle);
            return;
        }

        if (this.policy.voidsCycle(movement)) {
            await this.cycles.delete(open.id);
            return;
        }

        if (!this.policy.closesCycle(movement)) return;
        if (open.close(movement.occurredOn, movement.quantity)) {
            await this.cycles.save(open);
        }
    }
}
