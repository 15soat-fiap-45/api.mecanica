import { describe, expect, it } from 'vitest';
import { PecaInsumo } from './peca-insumo.js';
import { PecaInsumoId } from './peca-insumo-id.js';
import { CodigoPeca } from './value-objects/codigo-peca.js';
import { QuantidadeInsuficienteException } from './value-objects/quantidade.js';
import { UnidadeMedida } from './value-objects/unidade-medida.js';

describe('PecaInsumo Aggregate Root', () => {
    const validCodigo = CodigoPeca.create('PAST-FREIO-01');
    const validUnidade = UnidadeMedida.create('UNIDADE');

    const makeProps = (overrides = {}) => ({
        id: 'pec-1',
        descricao: 'Pastilha de freio dianteira',
        codigoPeca: validCodigo,
        quantidade: 10,
        unidadeMedida: validUnidade,
        ...overrides,
    });

    it('should create peca-insumo with string or PecaInsumoId', () => {
        const peca1 = PecaInsumo.create(makeProps());
        expect(peca1.id.value).toBe('pec-1');
        expect(peca1.version).toBe(0);
        expect(peca1.quantidade.value).toBe(10);

        const customId = new PecaInsumoId('pec-2');
        const peca2 = PecaInsumo.create(makeProps({ id: customId }));
        expect(peca2.id.equals(customId)).toBe(true);
    });

    it('should generate an id when none is provided', () => {
        const peca = PecaInsumo.create(makeProps({ id: undefined }));
        expect(peca.id.value).toBeTruthy();
    });

    it('should default quantity to zero when not provided', () => {
        const peca = PecaInsumo.create(makeProps({ quantidade: undefined }));
        expect(peca.quantidade.value).toBe(0);
    });

    it('should record PecaInsumoCadastrada event on PecaInsumo.cadastrar()', () => {
        const peca = PecaInsumo.cadastrar(makeProps());

        const events = peca.pullEvents();
        expect(events).toHaveLength(1);
        expect(events[0]?.eventName).toBe('estoque.peca-insumo-cadastrada');
        expect(events[0]?.aggregateId).toBe('pec-1');

        // Events should be cleared after pulling
        expect(peca.pullEvents()).toHaveLength(0);
    });

    it('should increase stock and record EstoqueAtualizado on registrarEntrada()', () => {
        const peca = PecaInsumo.create(makeProps());
        peca.pullEvents();

        peca.registrarEntrada(5);

        expect(peca.quantidade.value).toBe(15);
        const events = peca.pullEvents();
        expect(events).toHaveLength(1);
        expect(events[0]?.eventName).toBe('estoque.estoque-atualizado');
        expect(events[0]).toMatchObject({
            tipoMovimentacao: 'ENTRADA',
            quantidadeMovimentada: 5,
            quantidadeAnterior: 10,
            quantidadeAtual: 15,
        });
    });

    it('should decrease stock and record EstoqueAtualizado on darBaixa()', () => {
        const peca = PecaInsumo.create(makeProps());
        peca.pullEvents();

        peca.darBaixa(4);

        expect(peca.quantidade.value).toBe(6);
        const events = peca.pullEvents();
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            tipoMovimentacao: 'SAIDA',
            quantidadeMovimentada: 4,
            quantidadeAnterior: 10,
            quantidadeAtual: 6,
        });
    });

    it('should throw QuantidadeInsuficienteException when darBaixa exceeds stock', () => {
        const peca = PecaInsumo.create(makeProps());

        expect(() => peca.darBaixa(11)).toThrow(
            QuantidadeInsuficienteException,
        );
        expect(peca.quantidade.value).toBe(10);
        expect(peca.pullEvents()).toHaveLength(0);
    });

    it('should compare pecas by identity using AggregateRoot.equals()', () => {
        const peca1 = PecaInsumo.create(makeProps());
        const peca2 = PecaInsumo.create(
            makeProps({ descricao: 'Outra descrição' }),
        );
        const peca3 = PecaInsumo.create(makeProps({ id: 'pec-99' }));

        expect(peca1.equals(peca2)).toBe(true);
        expect(peca1.equals(peca3)).toBe(false);
    });
});
