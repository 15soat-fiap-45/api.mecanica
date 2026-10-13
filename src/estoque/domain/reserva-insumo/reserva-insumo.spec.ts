import { describe, expect, it } from 'vitest';
import { ReservaInsumo } from './reserva-insumo.js';
import { ReservaInsumoId } from './reserva-insumo-id.js';
import { StatusReservaInvalidoException } from './value-objects/status-reserva.js';

describe('ReservaInsumo Aggregate Root', () => {
    const makeProps = (overrides = {}) => ({
        id: 'res-1',
        pecaInsumoId: 'pec-1',
        ordemServicoId: 'os-1',
        quantidade: 2,
        ...overrides,
    });

    it('should create reserva with string or ReservaInsumoId', () => {
        const reserva1 = ReservaInsumo.create(makeProps());
        expect(reserva1.id.value).toBe('res-1');
        expect(reserva1.version).toBe(0);

        const customId = new ReservaInsumoId('res-2');
        const reserva2 = ReservaInsumo.create(makeProps({ id: customId }));
        expect(reserva2.id.equals(customId)).toBe(true);
    });

    it('should start with PENDENTE status by default', () => {
        const reserva = ReservaInsumo.create(makeProps());
        expect(reserva.status.value).toBe('PENDENTE');
    });

    it('should keep the peca-insumo and OS references plus the quantity', () => {
        const reserva = ReservaInsumo.create(makeProps());
        expect(reserva.pecaInsumoId.value).toBe('pec-1');
        expect(reserva.ordemServicoId).toBe('os-1');
        expect(reserva.quantidade.value).toBe(2);
    });

    it('should confirm a pending reservation', () => {
        const reserva = ReservaInsumo.create(makeProps());
        reserva.confirmar();
        expect(reserva.status.value).toBe('CONFIRMADA');
    });

    it('should consume a confirmed reservation', () => {
        const reserva = ReservaInsumo.create(makeProps());
        reserva.confirmar();
        reserva.consumir();
        expect(reserva.status.value).toBe('CONSUMIDA');
    });

    it('should cancel a pending or confirmed reservation', () => {
        const pendente = ReservaInsumo.create(makeProps());
        pendente.cancelar();
        expect(pendente.status.value).toBe('CANCELADA');

        const confirmada = ReservaInsumo.create(makeProps({ id: 'res-2' }));
        confirmada.confirmar();
        confirmada.cancelar();
        expect(confirmada.status.value).toBe('CANCELADA');
    });

    it('should reject invalid status transitions', () => {
        const reserva = ReservaInsumo.create(makeProps());
        expect(() => reserva.consumir()).toThrow(
            StatusReservaInvalidoException,
        );

        reserva.cancelar();
        expect(() => reserva.confirmar()).toThrow(
            StatusReservaInvalidoException,
        );
    });

    it('should compare reservas by identity using AggregateRoot.equals()', () => {
        const reserva1 = ReservaInsumo.create(makeProps());
        const reserva2 = ReservaInsumo.create(makeProps({ quantidade: 5 }));
        const reserva3 = ReservaInsumo.create(makeProps({ id: 'res-99' }));

        expect(reserva1.equals(reserva2)).toBe(true);
        expect(reserva1.equals(reserva3)).toBe(false);
    });
});
