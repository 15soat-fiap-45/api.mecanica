import type { UseCase } from '../../../shared/application/use-case.js';
import type { RestockCyclePolicy } from '../../domain/restock-cycle/restock-cycle-policy.js';
import type { RestockCycleRepository } from '../../domain/restock-cycle/restock-cycle.repository.js';
import { DurationStats } from '../../domain/shared/duration-stats.js';
import {
    type DurationStatsDto,
    InvalidLeadTimePeriodError,
} from './get-service-order-lead-time.js';

export interface GetRestockLeadTimeInput {
    partCode?: string | undefined;
    from?: Date | undefined;
    to?: Date | undefined;
}

export interface PartRestockLeadTimeDto extends DurationStatsDto {
    partCode: string;
    openCycleSince: string | null;
}

export interface GetRestockLeadTimeOutput {
    period: {
        from: string | null;
        to: string | null;
    };
    policy: { name: string; [key: string]: unknown };
    overall: DurationStatsDto;
    byPart: PartRestockLeadTimeDto[];
}

export class GetRestockLeadTime implements UseCase<
    GetRestockLeadTimeInput,
    GetRestockLeadTimeOutput
> {
    constructor(
        private readonly cycles: RestockCycleRepository,
        private readonly policy: RestockCyclePolicy,
    ) {}

    async execute(
        input: GetRestockLeadTimeInput = {},
    ): Promise<GetRestockLeadTimeOutput> {
        if (
            input.from &&
            input.to &&
            input.from.getTime() > input.to.getTime()
        ) {
            throw new InvalidLeadTimePeriodError();
        }

        const normalizedPart = input.partCode?.trim().toUpperCase();
        const [closedCycles, openCycles] = await Promise.all([
            this.cycles.findClosedBetween({
                partCode: normalizedPart,
                from: input.from,
                to: input.to,
            }),
            this.cycles.findOpen({ partCode: normalizedPart }),
        ]);

        const durationsByPart = new Map<string, number[]>();
        const allDurations: number[] = [];

        for (const cycle of closedCycles) {
            const duration = cycle.durationMs();
            if (duration === null) continue;
            allDurations.push(duration);
            const list = durationsByPart.get(cycle.partCode) ?? [];
            list.push(duration);
            durationsByPart.set(cycle.partCode, list);
        }

        const openSinceByPart = new Map<string, Date>();
        for (const open of openCycles) {
            openSinceByPart.set(open.partCode, open.openedAt);
            if (!durationsByPart.has(open.partCode)) {
                durationsByPart.set(open.partCode, []);
            }
        }

        const partCodes = [...durationsByPart.keys()].sort((a, b) =>
            a.localeCompare(b),
        );

        const byPart: PartRestockLeadTimeDto[] = partCodes.map((partCode) => {
            const stats = DurationStats.from(
                durationsByPart.get(partCode) ?? [],
            ).toJSON();
            const openSince = openSinceByPart.get(partCode);
            return {
                partCode,
                ...stats,
                openCycleSince: openSince ? openSince.toISOString() : null,
            };
        });

        return {
            period: {
                from: input.from ? input.from.toISOString() : null,
                to: input.to ? input.to.toISOString() : null,
            },
            policy: this.policy.describe(),
            overall: DurationStats.from(allDurations).toJSON(),
            byPart,
        };
    }
}
