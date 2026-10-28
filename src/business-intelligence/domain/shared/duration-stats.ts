/**
 * Aggregated statistics for a set of durations, in milliseconds.
 *
 * Immutable value object: every metric exposed by the BI context
 * (service order lead time, restock lead time) is reported with this shape.
 * An empty sample yields `count = 0` and `null` for the other fields, so
 * consumers can tell "no data" apart from "zero duration".
 */
export class DurationStats {
    private constructor(
        readonly count: number,
        readonly averageMs: number | null,
        readonly minMs: number | null,
        readonly maxMs: number | null,
    ) {
        Object.freeze(this);
    }

    static empty(): DurationStats {
        return new DurationStats(0, null, null, null);
    }

    /** Ignores non-finite and negative values (inconsistent samples). */
    static from(durationsMs: readonly number[]): DurationStats {
        const valid = durationsMs.filter(
            (value) => Number.isFinite(value) && value >= 0,
        );
        if (valid.length === 0) return DurationStats.empty();

        let sum = 0;
        let min = Number.POSITIVE_INFINITY;
        let max = Number.NEGATIVE_INFINITY;
        for (const value of valid) {
            sum += value;
            if (value < min) min = value;
            if (value > max) max = value;
        }
        return new DurationStats(
            valid.length,
            Math.round(sum / valid.length),
            min,
            max,
        );
    }

    toJSON(): {
        count: number;
        averageMs: number | null;
        minMs: number | null;
        maxMs: number | null;
    } {
        return {
            count: this.count,
            averageMs: this.averageMs,
            minMs: this.minMs,
            maxMs: this.maxMs,
        };
    }
}
