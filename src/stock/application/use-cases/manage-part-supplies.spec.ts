import { describe, expect, it, vi } from 'vitest';
import { PartCode } from '../../../shared/domain/part-code.js';
import { InvalidPartCodeException } from '../../../shared/domain/part-code.js';
import { PartSupply } from '../../domain/part-supply/part-supply.js';
import type { PartSupplyRepository } from '../../domain/part-supply/part-supply.repository.js';
import { InvalidUnitOfMeasureException } from '../../domain/part-supply/value-objects/unit-of-measure.js';
import { UnitOfMeasure } from '../../domain/part-supply/value-objects/unit-of-measure.js';
import { SupplyReservation } from '../../domain/supply-reservation/supply-reservation.js';
import type { SupplyReservationRepository } from '../../domain/supply-reservation/supply-reservation.repository.js';
import { ReservationStatus } from '../../domain/supply-reservation/value-objects/reservation-status.js';
import {
    DeactivatePartSupply,
    FindPartSupply,
    ListPartSupplies,
    PartSupplyInUseConflictError,
    UpdatePartSupply,
} from './manage-part-supplies.js';
import { PartSupplyNotFoundError } from './reserve-supply.js';

const makePart = (overrides = {}) =>
    PartSupply.create({
        id: 'pec-1',
        description: 'Pastilha de freio',
        partCode: PartCode.create('PAST-FREIO-01'),
        quantity: 7,
        unitOfMeasure: UnitOfMeasure.create('UNIT'),
        unitPriceCents: 8500,
        ...overrides,
    });

const partsWith = (
    part: PartSupply | null,
    all?: PartSupply[],
): PartSupplyRepository => ({
    save: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(part),
    findByPartCode: vi.fn().mockResolvedValue(part),
    ...(all ? { findAllActive: vi.fn().mockResolvedValue(all) } : {}),
});

const reservationsWith = (statuses: string[]): SupplyReservationRepository => ({
    save: vi.fn(),
    findById: vi.fn(),
    findByServiceOrderId: vi.fn(),
    findByServiceOrderIdAndPartSupply: vi.fn(),
    findByPartSupplyId: vi.fn().mockResolvedValue(
        statuses.map((status, i) =>
            SupplyReservation.create({
                id: `res-${i}`,
                partSupplyId: 'pec-1',
                serviceOrderId: `os-${i}`,
                quantity: 1,
                status: ReservationStatus.create(status),
            }),
        ),
    ),
});

const expectedOutput = {
    id: 'pec-1',
    description: 'Pastilha de freio',
    partCode: 'PAST-FREIO-01',
    quantity: 7,
    unitOfMeasure: 'UNIT',
    unitPriceCents: 8500,
};

describe('Part/supply catalog use cases', () => {
    it('lists active parts with their available balance', async () => {
        expect(
            await new ListPartSupplies(partsWith(null, [makePart()])).execute(),
        ).toEqual([expectedOutput]);
        expect(await new ListPartSupplies(partsWith(null)).execute()).toEqual(
            [],
        );
    });

    it('finds an active part by normalized code and hides inactive or unknown ones', async () => {
        const parts = partsWith(makePart());
        expect(
            await new FindPartSupply(parts).execute({
                partCode: 'past-freio-01',
            }),
        ).toEqual(expectedOutput);
        expect(parts.findByPartCode).toHaveBeenCalledWith(
            PartCode.create('PAST-FREIO-01'),
        );

        for (const missing of [null, makePart({ active: false })]) {
            await expect(
                new FindPartSupply(partsWith(missing)).execute({
                    partCode: 'PAST-FREIO-01',
                }),
            ).rejects.toThrow(PartSupplyNotFoundError);
        }
        await expect(
            new FindPartSupply(partsWith(null)).execute({ partCode: '#' }),
        ).rejects.toThrow(InvalidPartCodeException);
    });

    it('updates description, unit and price, keeping the balance', async () => {
        const part = makePart();
        const parts = partsWith(part);
        const result = await new UpdatePartSupply(parts).execute({
            partCode: 'PAST-FREIO-01',
            description: 'Pastilha cerâmica',
            unitOfMeasure: 'set',
            unitPriceCents: 12990,
        });
        expect(result).toEqual({
            ...expectedOutput,
            description: 'Pastilha cerâmica',
            unitOfMeasure: 'SET',
            unitPriceCents: 12990,
        });
        expect(parts.save).toHaveBeenCalledWith(part);

        await expect(
            new UpdatePartSupply(partsWith(makePart())).execute({
                partCode: 'PAST-FREIO-01',
                description: 'X',
                unitOfMeasure: 'BOX',
                unitPriceCents: 1,
            }),
        ).rejects.toThrow(InvalidUnitOfMeasureException);
        await expect(
            new UpdatePartSupply(partsWith(null)).execute({
                partCode: 'PAST-FREIO-01',
                description: 'X',
                unitOfMeasure: 'UNIT',
                unitPriceCents: 1,
            }),
        ).rejects.toThrow(PartSupplyNotFoundError);
    });

    it('deactivates a part without open reservations', async () => {
        const part = makePart();
        const parts = partsWith(part);
        await new DeactivatePartSupply(
            parts,
            reservationsWith(['CANCELLED', 'CONSUMED']),
        ).execute({ partCode: 'PAST-FREIO-01' });
        expect(part.active).toBe(false);
        expect(parts.save).toHaveBeenCalledWith(part);
    });

    it('refuses to deactivate a part held by open reservations or already inactive', async () => {
        for (const open of ['PENDING', 'CONFIRMED']) {
            const parts = partsWith(makePart());
            await expect(
                new DeactivatePartSupply(
                    parts,
                    reservationsWith(['CANCELLED', open]),
                ).execute({ partCode: 'PAST-FREIO-01' }),
            ).rejects.toThrow(PartSupplyInUseConflictError);
            expect(parts.save).not.toHaveBeenCalled();
        }
        await expect(
            new DeactivatePartSupply(
                partsWith(makePart({ active: false })),
                reservationsWith([]),
            ).execute({ partCode: 'PAST-FREIO-01' }),
        ).rejects.toThrow(PartSupplyNotFoundError);
    });
});
