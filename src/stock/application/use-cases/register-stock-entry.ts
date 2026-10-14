import type { PartSupplyRepository } from '../../domain/part-supply/part-supply.repository.js';
import { PartCode } from '../../../shared/domain/part-code.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import type { UseCase } from '../../../shared/application/use-case.js';
import { ApplicationException } from '../../../shared/application/application-exception.js';

export class PartSupplyNotFoundError extends ApplicationException {
    constructor() {
        super('Part/Supply not found.');
    }
}

export interface RegisterStockEntryInput {
    partCode: string;
    quantity: number;
}

export interface RegisterStockEntryOutput {
    id: string;
    partCode: string;
    quantity: number;
}

export class RegisterStockEntry implements UseCase<
    RegisterStockEntryInput,
    RegisterStockEntryOutput
> {
    constructor(
        private readonly partSupplyRepository: PartSupplyRepository,
        private readonly eventBus?: EventBus,
    ) {}

    async execute(
        input: RegisterStockEntryInput,
    ): Promise<RegisterStockEntryOutput> {
        const partCode = PartCode.create(input.partCode);

        const partSupply =
            await this.partSupplyRepository.findByPartCode(partCode);
        if (!partSupply) {
            throw new PartSupplyNotFoundError();
        }

        partSupply.registerEntry(input.quantity);

        await this.partSupplyRepository.save(partSupply);

        if (this.eventBus) {
            await this.eventBus.publish(partSupply.pullEvents());
        }

        return {
            id: partSupply.id.value,
            partCode: partSupply.partCode.value,
            quantity: partSupply.quantity.value,
        };
    }
}
