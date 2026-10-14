import { describe, expect, it } from 'vitest';
import {
    ServiceOrder,
    SupplyItemAlreadyAddedException,
    SupplyItemNotFoundException,
} from './service-order.js';
import { ServiceOrderId } from './service-order-id.js';
import {
    InvalidSupplyItemException,
    SupplyItemAlreadyUsedException,
} from './supply-item.js';
import { InvalidServiceOrderStatusException } from './value-objects/service-order-status.js';

describe('ServiceOrder Aggregate Root', () => {
    const makeProps = (overrides = {}) => ({
        id: 'os-1',
        description: 'Troca de pastilhas e fluido de freio',
        ...overrides,
    });

    it('should create service order with string or ServiceOrderId', () => {
        const os1 = ServiceOrder.create(makeProps());
        expect(os1.id.value).toBe('os-1');
        expect(os1.version).toBe(0);

        const customId = new ServiceOrderId('os-2');
        const os2 = ServiceOrder.create(makeProps({ id: customId }));
        expect(os2.id.equals(customId)).toBe(true);
    });

    it('should start with PENDING status by default', () => {
        const os = ServiceOrder.create(makeProps());
        expect(os.status.value).toBe('PENDING');
        expect(os.items).toHaveLength(0);
    });

    it('should record ServiceOrderRegistered event on ServiceOrder.register()', () => {
        const os = ServiceOrder.register(makeProps());

        const events = os.pullEvents();
        expect(events).toHaveLength(1);
        expect(events[0]?.eventName).toBe('service-order.registered');
        expect(events[0]?.aggregateId).toBe('os-1');

        expect(os.pullEvents()).toHaveLength(0);
    });

    it('should add a supply item and record AdditionalSuppliesIncluded', () => {
        const os = ServiceOrder.create(makeProps());

        os.addSupply('past-freio-01', 2);

        expect(os.items).toHaveLength(1);
        expect(os.items[0]?.partCode).toBe('PAST-FREIO-01');
        expect(os.items[0]?.quantity).toBe(2);

        const events = os.pullEvents();
        expect(events).toHaveLength(1);
        expect(events[0]?.eventName).toBe(
            'service-order.additional-supplies-included',
        );
        expect(events[0]).toMatchObject({
            items: [{ partCode: 'PAST-FREIO-01', quantity: 2 }],
        });
    });

    it('should throw SupplyItemAlreadyAddedException for a duplicate part code', () => {
        const os = ServiceOrder.create(makeProps());
        os.addSupply('PAST-FREIO-01', 2);

        expect(() => os.addSupply('past-freio-01', 1)).toThrow(
            SupplyItemAlreadyAddedException,
        );
    });

    it('should throw InvalidSupplyItemException for invalid input', () => {
        const os = ServiceOrder.create(makeProps());

        expect(() => os.addSupply('', 1)).toThrow(InvalidSupplyItemException);
        expect(() => os.addSupply('PAST-FREIO-01', 0)).toThrow(
            InvalidSupplyItemException,
        );
    });

    it('should mark a supply as used and record SupplyUsed', () => {
        const os = ServiceOrder.create(makeProps());
        os.addSupply('PAST-FREIO-01', 2);
        os.pullEvents();

        os.markSupplyUsed('past-freio-01');

        expect(os.items[0]?.used).toBe(true);
        const events = os.pullEvents();
        expect(events).toHaveLength(1);
        expect(events[0]?.eventName).toBe('service-order.supply-used');
        expect(events[0]).toMatchObject({
            partCode: 'PAST-FREIO-01',
            quantity: 2,
        });
    });

    it('should throw SupplyItemNotFoundException when item does not exist', () => {
        const os = ServiceOrder.create(makeProps());

        expect(() => os.markSupplyUsed('PAST-FREIO-01')).toThrow(
            SupplyItemNotFoundException,
        );
    });

    it('should throw SupplyItemAlreadyUsedException when marking the same item twice', () => {
        const os = ServiceOrder.create(makeProps());
        os.addSupply('PAST-FREIO-01', 2);
        os.markSupplyUsed('PAST-FREIO-01');

        expect(() => os.markSupplyUsed('PAST-FREIO-01')).toThrow(
            SupplyItemAlreadyUsedException,
        );
    });

    it('should approve a pending service order', () => {
        const os = ServiceOrder.create(makeProps());
        os.approve();
        expect(os.status.value).toBe('APPROVED');
    });

    it('should finish an in-progress service order and record ServiceOrderFinished', () => {
        const os = ServiceOrder.create(makeProps());
        os.approve();
        os.startExecution();
        os.pullEvents();

        os.finish();

        expect(os.status.value).toBe('COMPLETED');
        const events = os.pullEvents();
        expect(events).toHaveLength(1);
        expect(events[0]?.eventName).toBe('service-order.finished');
        expect(events[0]?.aggregateId).toBe('os-1');
    });

    it('should finish only from IN_PROGRESS', () => {
        const os = ServiceOrder.create(makeProps());
        expect(() => os.finish()).toThrow(InvalidServiceOrderStatusException);

        os.approve();
        expect(() => os.finish()).toThrow(InvalidServiceOrderStatusException);
    });

    it('should not approve twice', () => {
        const os = ServiceOrder.create(makeProps());
        os.approve();
        expect(() => os.approve()).toThrow(InvalidServiceOrderStatusException);
    });

    it('should compare service orders by identity using AggregateRoot.equals()', () => {
        const os1 = ServiceOrder.create(makeProps());
        const os2 = ServiceOrder.create(
            makeProps({ description: 'Outro serviço' }),
        );
        const os3 = ServiceOrder.create(makeProps({ id: 'os-99' }));

        expect(os1.equals(os2)).toBe(true);
        expect(os1.equals(os3)).toBe(false);
    });
});
