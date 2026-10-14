import { describe, expect, it } from 'vitest';
import {
    StatusReserva,
    StatusReservaInvalidoException,
} from './status-reserva.js';

describe('StatusReserva Value Object', () => {
    describe('Criação', () => {
        it.each(['PENDENTE', 'CONFIRMADA', 'CANCELADA', 'CONSUMIDA'])(
            'should create status %s',
            (tipo) => {
                expect(StatusReserva.create(tipo).value).toBe(tipo);
            },
        );

        it('should create the initial status via StatusReserva.pendente()', () => {
            expect(StatusReserva.pendente().value).toBe('PENDENTE');
        });

        it('should normalize lowercase input', () => {
            expect(StatusReserva.create('confirmada').value).toBe('CONFIRMADA');
        });

        it('should throw StatusReservaInvalidoException for unknown values', () => {
            expect(() => StatusReserva.create('FINALIZADA')).toThrow(
                StatusReservaInvalidoException,
            );
            expect(() => StatusReserva.create('')).toThrow(
                StatusReservaInvalidoException,
            );
        });

        it('should return true for StatusReserva.isValid with valid input', () => {
            expect(StatusReserva.isValid('PENDENTE')).toBe(true);
        });

        it('should return false for StatusReserva.isValid with invalid input', () => {
            expect(StatusReserva.isValid('FINALIZADA')).toBe(false);
        });
    });

    describe('Transições', () => {
        it('should allow PENDENTE -> CONFIRMADA', () => {
            expect(
                StatusReserva.pendente().transicionarPara('CONFIRMADA').value,
            ).toBe('CONFIRMADA');
        });

        it('should allow PENDENTE -> CANCELADA', () => {
            expect(
                StatusReserva.pendente().transicionarPara('CANCELADA').value,
            ).toBe('CANCELADA');
        });

        it('should allow CONFIRMADA -> CONSUMIDA', () => {
            const confirmada =
                StatusReserva.pendente().transicionarPara('CONFIRMADA');
            expect(confirmada.transicionarPara('CONSUMIDA').value).toBe(
                'CONSUMIDA',
            );
        });

        it('should allow CONFIRMADA -> CANCELADA', () => {
            const confirmada =
                StatusReserva.pendente().transicionarPara('CONFIRMADA');
            expect(confirmada.transicionarPara('CANCELADA').value).toBe(
                'CANCELADA',
            );
        });

        it('should reject PENDENTE -> CONSUMIDA', () => {
            expect(() =>
                StatusReserva.pendente().transicionarPara('CONSUMIDA'),
            ).toThrow(StatusReservaInvalidoException);
        });

        it('should reject transitions from terminal statuses', () => {
            const consumida = StatusReserva.create('CONSUMIDA');
            const cancelada = StatusReserva.create('CANCELADA');

            expect(() => consumida.transicionarPara('PENDENTE')).toThrow(
                StatusReservaInvalidoException,
            );
            expect(() => cancelada.transicionarPara('CONFIRMADA')).toThrow(
                StatusReservaInvalidoException,
            );
        });

        it('should check transitions with podeTransicionarPara', () => {
            expect(
                StatusReserva.pendente().podeTransicionarPara('CONFIRMADA'),
            ).toBe(true);
            expect(
                StatusReserva.pendente().podeTransicionarPara('CONSUMIDA'),
            ).toBe(false);
        });
    });

    describe('Igualdade', () => {
        it('should be equal for the same status', () => {
            expect(
                StatusReserva.pendente().equals(StatusReserva.pendente()),
            ).toBe(true);
        });

        it('should not be equal for different statuses or null', () => {
            expect(
                StatusReserva.pendente().equals(
                    StatusReserva.create('CONFIRMADA'),
                ),
            ).toBe(false);
            expect(StatusReserva.pendente().equals(null)).toBe(false);
        });

        it('should convert to string', () => {
            expect(StatusReserva.pendente().toString()).toBe('PENDENTE');
        });
    });
});
