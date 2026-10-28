import { ApplicationException } from '../../../shared/application/application-exception.js';
import type { UseCase } from '../../../shared/application/use-case.js';
import { DurationStats } from '../../domain/shared/duration-stats.js';
import type { ServiceOrderTimelineRepository } from '../../domain/service-order-timeline/service-order-timeline.repository.js';

export class InvalidLeadTimePeriodError extends ApplicationException {
    constructor(
        message = 'Invalid period: "from" must be earlier than or equal to "to"',
    ) {
        super(message);
        this.name = 'InvalidLeadTimePeriodError';
    }
}

export interface GetServiceOrderLeadTimeInput {
    from?: Date | undefined;
    to?: Date | undefined;
}

export interface DurationStatsDto {
    count: number;
    averageMs: number | null;
    minMs: number | null;
    maxMs: number | null;
}

export interface GetServiceOrderLeadTimeOutput {
    period: {
        from: string | null;
        to: string | null;
    };
    totalLeadTime: DurationStatsDto;
    executionTime: DurationStatsDto;
    deliveryLeadTime: DurationStatsDto;
}

const collectNumbers = (values: (number | null)[]): number[] =>
    values.filter((value): value is number => value !== null);

export class GetServiceOrderLeadTime
    implements
        UseCase<GetServiceOrderLeadTimeInput, GetServiceOrderLeadTimeOutput>
{
    constructor(
        private readonly timelines: ServiceOrderTimelineRepository,
    ) {}

    async execute(
        input: GetServiceOrderLeadTimeInput = {},
    ): Promise<GetServiceOrderLeadTimeOutput> {
        if (
            input.from &&
            input.to &&
            input.from.getTime() > input.to.getTime()
        ) {
            throw new InvalidLeadTimePeriodError();
        }

        const [finished, delivered] = await Promise.all([
            this.timelines.findFinishedBetween(input),
            this.timelines.findDeliveredBetween(input),
        ]);

        const totalLeadTime = DurationStats.from(
            collectNumbers(finished.map((item) => item.totalLeadTimeMs())),
        );
        const executionTime = DurationStats.from(
            collectNumbers(finished.map((item) => item.executionTimeMs())),
        );
        const deliveryLeadTime = DurationStats.from(
            collectNumbers(delivered.map((item) => item.deliveryLeadTimeMs())),
        );

        return {
            period: {
                from: input.from ? input.from.toISOString() : null,
                to: input.to ? input.to.toISOString() : null,
            },
            totalLeadTime: totalLeadTime.toJSON(),
            executionTime: executionTime.toJSON(),
            deliveryLeadTime: deliveryLeadTime.toJSON(),
        };
    }
}
