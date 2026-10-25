import { describe, expect, it } from 'vitest';
import { Plate } from './value-objects/plate.js';
import { VehicleId } from './vehicle-id.js';
import { Vehicle } from './vehicle.js';
import { CpfCnpj } from '../customer/value-objects/cpf-cnpj.js';

describe('Vehicle Aggregate Root', () => {
    const validPlate = Plate.create('ABC-1234');
    const customerId = CpfCnpj.create('52998224725');

    it('should create vehicle with string or VehicleId', () => {
        const vehicle1 = new Vehicle(
            'veh-1',
            customerId,
            'Civic',
            2020,
            'Honda',
            'Black',
            validPlate,
        );
        expect(vehicle1.id.value).toBe('veh-1');
        expect(vehicle1.version).toBe(0);

        const customId = new VehicleId('veh-2');
        const vehicle2 = Vehicle.create({
            id: customId,
            customerId,
            model: 'Corolla',
            year: 2021,
            brand: 'Toyota',
            color: 'White',
            plate: validPlate,
        });
        expect(vehicle2.id.equals(customId)).toBe(true);
    });

    it('should record VehicleRegistered event on Vehicle.register()', () => {
        const vehicle = Vehicle.register({
            id: 'veh-100',
            customerId,
            model: 'Golf',
            year: 2022,
            brand: 'Volkswagen',
            color: 'Blue',
            plate: validPlate,
        });

        const events = vehicle.pullEvents();
        expect(events).toHaveLength(1);
        expect(events[0]?.eventName).toBe('registry.vehicle-registered');
        expect(events[0]?.aggregateId).toBe('veh-100');

        // Events should be cleared after pulling
        expect(vehicle.pullEvents()).toHaveLength(0);
    });

    it('should compare vehicles by identity using AggregateRoot.equals()', () => {
        const vehicle1 = new Vehicle(
            'veh-1',
            customerId,
            'Civic',
            2020,
            'Honda',
            'Black',
            validPlate,
        );
        const vehicle2 = new Vehicle(
            'veh-1',
            customerId,
            'Civic Different Color',
            2020,
            'Honda',
            'Red',
            validPlate,
        );
        const vehicle3 = new Vehicle(
            'veh-2',
            customerId,
            'Civic',
            2020,
            'Honda',
            'Black',
            validPlate,
        );

        expect(vehicle1.equals(vehicle2)).toBe(true);
        expect(vehicle1.equals(vehicle3)).toBe(false);
    });
});
