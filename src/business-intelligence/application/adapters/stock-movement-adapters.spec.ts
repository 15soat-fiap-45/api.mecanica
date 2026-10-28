import { describe, expect, it } from 'vitest';
import {
    fromStockMovementRecorded,
    fromStockUpdated,
} from './stock-movement-adapters.js';

describe('stock-movement-adapters', () => {
    it('adapts stock.stock-updated into StockMovement', () => {
        const occurredOn = new Date('2026-03-01T12:00:00.000Z');
        const movement = fromStockUpdated({
            eventId: 'evt-1',
            eventName: 'stock.stock-updated',
            aggregateId: 'part-1',
            occurredOn,
            partCode: ' past-freio-01 ',
            movementType: 'EXIT',
            movedQuantity: 3,
            previousQuantity: 3,
            currentQuantity: 0,
        });

        expect(movement).toEqual({
            partCode: 'PAST-FREIO-01',
            type: 'EXIT',
            quantity: 3,
            quantityBefore: 3,
            quantityAfter: 0,
            occurredOn,
        });
    });

    it('maps the stock.stock-updated reason into the neutral vocabulary', () => {
        const base = {
            eventId: 'evt-3',
            eventName: 'stock.stock-updated' as const,
            aggregateId: 'part-1',
            occurredOn: new Date('2026-03-01T13:00:00.000Z'),
            partCode: 'PAST-FREIO-01',
            movementType: 'ENTRY' as const,
            movedQuantity: 2,
            previousQuantity: 0,
            currentQuantity: 2,
        };

        expect(
            fromStockUpdated({ ...base, reason: 'RESERVATION_CANCELLED' })
                .reason,
        ).toBe('RETURN');
        expect(
            fromStockUpdated({ ...base, reason: 'STOCK_ENTRY' }).reason,
        ).toBe('PURCHASE');
        expect(
            fromStockUpdated({
                ...base,
                movementType: 'EXIT',
                reason: 'RESERVATION',
            }).reason,
        ).toBe('RESERVATION');
    });

    it('adapts stock.movement-recorded into StockMovement preserving reason and movementId', () => {
        const occurredOn = new Date('2026-03-01T14:00:00.000Z');
        const movement = fromStockMovementRecorded({
            eventId: 'evt-2',
            eventName: 'stock.movement-recorded',
            aggregateId: 'part-1',
            occurredOn,
            movementId: 'mov-99',
            partCode: 'oleo-5w30',
            movementType: 'ENTRY',
            reason: 'PURCHASE',
            quantity: 10,
            quantityBefore: 0,
            quantityAfter: 10,
            referenceId: 'nf-123',
        });

        expect(movement).toEqual({
            partCode: 'OLEO-5W30',
            type: 'ENTRY',
            quantity: 10,
            quantityBefore: 0,
            quantityAfter: 10,
            occurredOn,
            reason: 'PURCHASE',
            movementId: 'mov-99',
        });
    });
});
