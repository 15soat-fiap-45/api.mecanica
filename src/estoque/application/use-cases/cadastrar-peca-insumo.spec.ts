import { describe, expect, it, vi } from 'vitest';
import type { PecaInsumoRepository } from '../../domain/peca-insumo/peca-insumo.repository.js';
import type { PecaInsumo } from '../../domain/peca-insumo/peca-insumo.js';
import { CodigoPecaInvalidoException } from '../../domain/peca-insumo/value-objects/codigo-peca.js';
import type { EventBus } from '../../../shared/application/event-bus.js';
import {
    CadastrarPecaInsumo,
    PecaInsumoJaCadastradaError,
} from './cadastrar-peca-insumo.js';

describe('CadastrarPecaInsumo Use Case', () => {
    const validInput = {
        id: 'pec-1',
        descricao: 'Pastilha de freio dianteira',
        codigoPeca: 'past-freio-01',
        quantidade: 10,
        unidadeMedida: 'unidade',
    };

    const makeRepository = (
        existingByCodigo: PecaInsumo | null = null,
        existingById: PecaInsumo | null = null,
    ): PecaInsumoRepository => ({
        save: vi.fn().mockResolvedValue(undefined),
        findById: vi.fn().mockResolvedValue(existingById),
        findByCodigoPeca: vi.fn().mockResolvedValue(existingByCodigo),
    });

    const makeEventBus = (): EventBus => ({
        publish: vi.fn().mockResolvedValue(undefined),
        subscribe: vi.fn(),
    });

    it('should register a new peca-insumo successfully and publish domain event', async () => {
        const repository = makeRepository();
        const eventBus = makeEventBus();
        const useCase = new CadastrarPecaInsumo(repository, eventBus);

        const result = await useCase.execute(validInput);

        expect(result).toEqual({
            id: 'pec-1',
            descricao: 'Pastilha de freio dianteira',
            codigoPeca: 'PAST-FREIO-01',
            quantidade: 10,
            unidadeMedida: 'UNIDADE',
        });
        expect(repository.save).toHaveBeenCalledTimes(1);
        expect(eventBus.publish).toHaveBeenCalledTimes(1);
        expect(eventBus.publish).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    eventName: 'estoque.peca-insumo-cadastrada',
                    aggregateId: 'pec-1',
                    codigoPeca: 'PAST-FREIO-01',
                    quantidadeInicial: 10,
                }),
            ]),
        );
    });

    it('should generate an id and default quantity to zero when not provided', async () => {
        const repository = makeRepository();
        const useCase = new CadastrarPecaInsumo(repository);

        const result = await useCase.execute({
            descricao: 'Óleo 5W30',
            codigoPeca: 'OLEO-5W30',
            unidadeMedida: 'LITRO',
        });

        expect(result.id).toBeTruthy();
        expect(result.quantidade).toBe(0);
        expect(repository.save).toHaveBeenCalledTimes(1);
    });

    it('should throw PecaInsumoJaCadastradaError when codigo already exists', async () => {
        const repository = makeRepository({} as PecaInsumo);
        const useCase = new CadastrarPecaInsumo(repository);

        await expect(useCase.execute(validInput)).rejects.toThrow(
            PecaInsumoJaCadastradaError,
        );
        expect(repository.save).not.toHaveBeenCalled();
    });

    it('should throw PecaInsumoJaCadastradaError when id already exists', async () => {
        const repository = makeRepository(null, {} as PecaInsumo);
        const useCase = new CadastrarPecaInsumo(repository);

        await expect(useCase.execute(validInput)).rejects.toThrow(
            PecaInsumoJaCadastradaError,
        );
        expect(repository.save).not.toHaveBeenCalled();
    });

    it('should throw CodigoPecaInvalidoException when codigo format is invalid', async () => {
        const repository = makeRepository();
        const useCase = new CadastrarPecaInsumo(repository);

        await expect(
            useCase.execute({ ...validInput, codigoPeca: 'AB' }),
        ).rejects.toThrow(CodigoPecaInvalidoException);
        expect(repository.save).not.toHaveBeenCalled();
    });
});
