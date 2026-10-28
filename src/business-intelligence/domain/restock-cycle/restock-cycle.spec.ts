import { describe, expect, it } from 'vitest';
import {
    InvalidReorderPointException,
    ReorderPointRestockPolicy,
} from './restock-cycle-policy.js';
import { RestockCycle } from './restock-cycle.js';
import type { StockMovement } from './stock-movement.js';

const at = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 0, minutes));
const MINUTE = 60_000;

const makeMovement = (
    overrides: Partial<StockMovement> = {},
): StockMovement => ({
    partCode: 'PAST-FREIO-01',
    type: 'EXIT',
    quantity: 2,
    quantityBefore: 2,
    quantityAfter: 0,
    occurredOn: at(0),
    ...overrides,
});

describe('ReorderPointRestockPolicy', () => {
    it('defaults reorderPoint to 0 (stockout)', () => {
        const policy = new ReorderPointRestockPolicy();
        expect(policy.describe()).toEqual({
            name: 'REORDER_POINT',
            reorderPoint: 0,
        });
        expect(policy.opensCycle(makeMovement({ quantityAfter: 0 }))).toBe(
            true,
        );
        expect(policy.opensCycle(makeMovement({ quantityAfter: 1 }))).toBe(
            false,
        );
        expect(
            policy.closesCycle(
                makeMovement({ type: 'ENTRY', quantityAfter: 5 }),
            ),
        ).toBe(true);
    });

    it('supports a custom reorder point', () => {
        const policy = new ReorderPointRestockPolicy(3);
        expect(policy.opensCycle(makeMovement({ quantityAfter: 3 }))).toBe(
            true,
        );
        expect(policy.opensCycle(makeMovement({ quantityAfter: 4 }))).toBe(
            false,
        );
        expect(
            policy.closesCycle(
                makeMovement({ type: 'ENTRY', quantityAfter: 3 }),
            ),
        ).toBe(false);
        expect(
            policy.closesCycle(
                makeMovement({ type: 'ENTRY', quantityAfter: 4 }),
            ),
        ).toBe(true);
    });

    it('ignores manual adjustment entries when closing a cycle', () => {
        const policy = new ReorderPointRestockPolicy(0);
        expect(
            policy.closesCycle(
                makeMovement({
                    type: 'ENTRY',
                    quantityAfter: 10,
                    reason: 'MANUAL',
                }),
            ),
        ).toBe(false);
    });

    it('rejects negative or non-integer reorder points', () => {
        for (const invalid of [-1, 1.5, Number.NaN]) {
            expect(() => new ReorderPointRestockPolicy(invalid)).toThrow(
                InvalidReorderPointException,
            );
        }
    });
});

describe('RestockCycle', () => {
    it('normalizes partCode and computes duration once closed', () => {
        const cycle = RestockCycle.open({
            id: 'cycle-1',
            partCode: ' past-freio-01 ',
            openedAt: at(10),
            quantityAtOpen: 0,
        });

        expect(cycle.id).toBe('cycle-1');
        expect(cycle.partCode).toBe('PAST-FREIO-01');
        expect(cycle.isOpen).toBe(true);
        expect(cycle.durationMs()).toBeNull();

        expect(cycle.close(at(40), 10)).toBe(true);
        expect(cycle.isOpen).toBe(false);
        expect(cycle.closedAt).toEqual(at(40));
        expect(cycle.durationMs()).toBe(30 * MINUTE);
    });

    it('does not close twice or with a timestamp before openedAt', () => {
        const cycle = RestockCycle.open({
            partCode: 'PAST-FREIO-01',
            openedAt: at(20),
            quantityAtOpen: 0,
        });

        expect(cycle.close(at(10), 5)).toBe(false);
        expect(cycle.isOpen).toBe(true);

        expect(cycle.close(at(30), 5)).toBe(true);
        expect(cycle.close(at(50), 5)).toBe(false);
        expect(cycle.closedAt).toEqual(at(30));
    });
});
