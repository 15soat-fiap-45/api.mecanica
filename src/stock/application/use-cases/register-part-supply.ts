import type { PartSupplyRepository } from '../../domain/part-supply/part-supply.repository.js';
import { PartSupply } from '../../domain/part-supply/part-supply.js';
import { PartCode } from '../../domain/part-supply/value-objects/part-code.js';
import { UnitOfMeasure } from '../../domain/part-supply/value-objects/unit-of-measure.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import type { UseCase } from '../../../shared/application/use-case.js';
import { ApplicationException } from '../../../shared/application/application-exception.js';

export class PartSupplyAlreadyRegisteredError extends ApplicationException {
    constructor(message = 'Part/Supply with this code is already registered.') {
        super(message);
    }
}

export interface RegisterPartSupplyInput {
    id?: string | undefined;
    description: string;
    partCode: string;
    quantity?: number | undefined;
    unitOfMeasure: string;
}

export interface RegisterPartSupplyOutput {
    id: string;
    description: string;
    partCode: string;
    quantity: number;
    unitOfMeasure: string;
}

export class RegisterPartSupply implements UseCase<
    RegisterPartSupplyInput,
    RegisterPartSupplyOutput
> {
    constructor(
        private readonly partSupplyRepository: PartSupplyRepository,
        private readonly eventBus?: EventBus,
    ) {}

    async execute(
        input: RegisterPartSupplyInput,
    ): Promise<RegisterPartSupplyOutput> {
        const partCode = PartCode.create(input.partCode);

        const existingByCode =
            await this.partSupplyRepository.findByPartCode(partCode);
        if (existingByCode) {
            throw new PartSupplyAlreadyRegisteredError();
        }

        if (input.id) {
            const existingById = await this.partSupplyRepository.findById(
                input.id,
            );
            if (existingById) {
                throw new PartSupplyAlreadyRegisteredError(
                    'Part/Supply with this ID is already registered.',
                );
            }
        }

        const unitOfMeasure = UnitOfMeasure.create(input.unitOfMeasure);

        const partSupply = PartSupply.register({
            id: input.id,
            description: input.description,
            partCode,
            quantity: input.quantity,
            unitOfMeasure,
        });

        await this.partSupplyRepository.save(partSupply);

        if (this.eventBus) {
            await this.eventBus.publish(partSupply.pullEvents());
        }

        return {
            id: partSupply.id.value,
            description: partSupply.description,
            partCode: partSupply.partCode.value,
            quantity: partSupply.quantity.value,
            unitOfMeasure: partSupply.unitOfMeasure.value,
        };
    }
}
