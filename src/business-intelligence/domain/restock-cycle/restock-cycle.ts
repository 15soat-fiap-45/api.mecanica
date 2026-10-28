export interface RestockCycleSnapshot {
    id: string;
    partCode: string;
    openedAt: Date;
    closedAt: Date | null;
    quantityAtOpen: number;
    restockedQuantity: number | null;
}

/**
 * Represents one replenishment cycle for a part: from the moment stock reached
 * the reorder threshold until the replenishment entry was recorded.
 */
export class RestockCycle {
    private constructor(private readonly state: RestockCycleSnapshot) {}

    static open(props: {
        id?: string | undefined;
        partCode: string;
        openedAt: Date;
        quantityAtOpen: number;
    }): RestockCycle {
        return new RestockCycle({
            id: props.id ?? crypto.randomUUID(),
            partCode: props.partCode.trim().toUpperCase(),
            openedAt: props.openedAt,
            closedAt: null,
            quantityAtOpen: props.quantityAtOpen,
            restockedQuantity: null,
        });
    }

    static restore(snapshot: RestockCycleSnapshot): RestockCycle {
        return new RestockCycle({ ...snapshot });
    }

    get id(): string {
        return this.state.id;
    }

    get partCode(): string {
        return this.state.partCode;
    }

    get openedAt(): Date {
        return this.state.openedAt;
    }

    get closedAt(): Date | null {
        return this.state.closedAt;
    }

    get isOpen(): boolean {
        return this.state.closedAt === null;
    }

    /**
     * Closes the cycle if still open and `closedAt >= openedAt`.
     * Returns `true` when the cycle transitioned to closed, `false` when it
     * was already closed or the event timestamp predates `openedAt`.
     */
    close(closedAt: Date, restockedQuantity: number): boolean {
        if (!this.isOpen) return false;
        if (closedAt.getTime() < this.state.openedAt.getTime()) return false;
        this.state.closedAt = closedAt;
        this.state.restockedQuantity = restockedQuantity;
        return true;
    }

    durationMs(): number | null {
        if (!this.state.closedAt) return null;
        const duration =
            this.state.closedAt.getTime() - this.state.openedAt.getTime();
        return duration >= 0 ? duration : null;
    }

    toSnapshot(): RestockCycleSnapshot {
        return { ...this.state };
    }
}
