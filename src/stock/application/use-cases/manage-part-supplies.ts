import { ApplicationException } from '../../../shared/application/application-exception.js';
import type { UseCase } from '../../../shared/application/use-case.js';
import type { PartSupply } from '../../domain/part-supply/part-supply.js';
import type { PartSupplyRepository } from '../../domain/part-supply/part-supply.repository.js';
import { UnitOfMeasure } from '../../domain/part-supply/value-objects/unit-of-measure.js';
import type { SupplyReservationRepository } from '../../domain/supply-reservation/supply-reservation.repository.js';
import { PartCode } from '../../../shared/domain/part-code.js';
import { PartSupplyNotFoundError } from './reserve-supply.js';

export class PartSupplyInUseConflictError extends ApplicationException {
    constructor() {
        super(
            'Cannot deactivate a part/supply with open reservations for service orders.',
        );
    }
}

export interface PartSupplyOutput {
    id: string;
    description: string;
    partCode: string;
    /** Available balance (open reservations are already deducted). */
    quantity: number;
    unitOfMeasure: string;
    unitPriceCents: number;
}

export const toPartSupplyOutput = (part: PartSupply): PartSupplyOutput => ({
    id: part.id.value,
    description: part.description,
    partCode: part.partCode.value,
    quantity: part.quantity.value,
    unitOfMeasure: part.unitOfMeasure.value,
    unitPriceCents: part.unitPriceCents,
});

async function findActive(
    parts: PartSupplyRepository,
    partCode: string,
): Promise<PartSupply> {
    const part = await parts.findByPartCode(PartCode.create(partCode));
    if (!part?.active) throw new PartSupplyNotFoundError();
    return part;
}

export class ListPartSupplies implements UseCase<void, PartSupplyOutput[]> {
    constructor(private readonly parts: PartSupplyRepository) {}

    async execute(): Promise<PartSupplyOutput[]> {
        return ((await this.parts.findAllActive?.()) ?? []).map(
            toPartSupplyOutput,
        );
    }
}

export class FindPartSupply implements UseCase<
    { partCode: string },
    PartSupplyOutput
> {
    constructor(private readonly parts: PartSupplyRepository) {}

    async execute(input: { partCode: string }): Promise<PartSupplyOutput> {
        return toPartSupplyOutput(await findActive(this.parts, input.partCode));
    }
}

export interface UpdatePartSupplyInput {
    partCode: string;
    description: string;
    unitOfMeasure: string;
    unitPriceCents: number;
}

/** Atualiza os dados cadastrais; o saldo só muda por movimentações. */
export class UpdatePartSupply implements UseCase<
    UpdatePartSupplyInput,
    PartSupplyOutput
> {
    constructor(private readonly parts: PartSupplyRepository) {}

    async execute(input: UpdatePartSupplyInput): Promise<PartSupplyOutput> {
        const part = await findActive(this.parts, input.partCode);
        part.updateDetails({
            description: input.description,
            unitOfMeasure: UnitOfMeasure.create(input.unitOfMeasure),
            unitPriceCents: input.unitPriceCents,
        });
        await this.parts.save(part);
        return toPartSupplyOutput(part);
    }
}

/**
 * Exclusão lógica: a peça tem histórico de movimentações e reservas, então
 * sai do catálogo (não pode mais ser incluída em OS) sem perder o histórico.
 */
export class DeactivatePartSupply implements UseCase<
    { partCode: string },
    void
> {
    constructor(
        private readonly parts: PartSupplyRepository,
        private readonly reservations: SupplyReservationRepository,
    ) {}

    async execute(input: { partCode: string }): Promise<void> {
        const part = await findActive(this.parts, input.partCode);
        const reservations = await this.reservations.findByPartSupplyId(
            part.id,
        );
        if (reservations.some((reservation) => reservation.status.isOpen()))
            throw new PartSupplyInUseConflictError();
        part.deactivate();
        await this.parts.save(part);
    }
}
