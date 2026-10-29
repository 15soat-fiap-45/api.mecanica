import { describe, expect, it } from 'vitest';
import { DurationStats } from './duration-stats.js';

describe('DurationStats', () => {
    it('reports no data for an empty sample', () => {
        expect(DurationStats.from([]).toJSON()).toEqual({
            count: 0,
            averageMs: null,
            minMs: null,
            maxMs: null,
        });
    });

    it('handles a single value', () => {
        expect(DurationStats.from([1000]).toJSON()).toEqual({
            count: 1,
            averageMs: 1000,
            minMs: 1000,
            maxMs: 1000,
        });
    });

    it('computes count, rounded average, min and max', () => {
        const stats = DurationStats.from([1000, 2000, 4000]);
        expect(stats.count).toBe(3);
        expect(stats.averageMs).toBe(2333);
        expect(stats.minMs).toBe(1000);
        expect(stats.maxMs).toBe(4000);
    });

    it('ignores negative and non-finite samples', () => {
        const stats = DurationStats.from([
            -5,
            Number.NaN,
            Number.POSITIVE_INFINITY,
            0,
            10,
        ]);
        expect(stats.toJSON()).toEqual({
            count: 2,
            averageMs: 5,
            minMs: 0,
            maxMs: 10,
        });
    });

    it('is immutable', () => {
        const stats = DurationStats.from([1]);
        expect(Object.isFrozen(stats)).toBe(true);
    });
});
