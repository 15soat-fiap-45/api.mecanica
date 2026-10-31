import { describe, expect, it } from 'vitest';
import {
    InvalidServiceOrderDescriptionException,
    ServiceItemAlreadyAddedException,
    ServiceItemNotFoundException,
    ServiceOrder,
    SupplyItemAlreadyAddedException,
    SupplyItemNotFoundException,
} from './service-order.js';
import { ServiceOrderId } from './service-order-id.js';
import {
    InvalidSupplyItemException,
    SupplyItemAlreadyUsedException,
} from './supply-item.js';
import { InvalidServiceItemException } from './service-item.js';
import {
    InvalidServiceOrderStatusException,
    ServiceOrderStatus,
} from './value-objects/service-order-status.js';

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

    it('updates and trims the description during evaluation', () => {
        const os = ServiceOrder.create(makeProps());
        os.updateDescription('  Pastilhas desgastadas.\nSubstituir o par.  ');
        expect(os.description).toBe(
            'Pastilhas desgastadas.\nSubstituir o par.',
        );
        expect(os.status.value).toBe('PENDING');
    });

    it('rejects a blank evaluation description without changing the order', () => {
        const os = ServiceOrder.create(makeProps());
        expect(() => os.updateDescription(' \n ')).toThrow(
            InvalidServiceOrderDescriptionException,
        );
        expect(os.description).toBe(makeProps().description);
    });

    it.each([
        'AWAITING_APPROVAL',
        'APPROVED',
        'REJECTED',
        'IN_PROGRESS',
        'PAUSED',
        'COMPLETED',
        'DELIVERED',
        'CANCELLED',
    ])('rejects description changes in %s', (status) => {
        const os = ServiceOrder.create(
            makeProps({
                status: ServiceOrderStatus.create(status),
            }),
        );
        expect(() => os.updateDescription('Novo diagnóstico')).toThrow(
            InvalidServiceOrderStatusException,
        );
        expect(os.description).toBe(makeProps().description);
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

    it('should reject part codes that are invalid in the Stock context', () => {
        const os = ServiceOrder.create(makeProps());

        // too short, spaces and accents are all rejected by PartCode
        expect(() => os.addSupply('ab', 1)).toThrow(InvalidSupplyItemException);
        expect(() => os.addSupply('A B', 1)).toThrow(
            InvalidSupplyItemException,
        );
        expect(() => os.addSupply('ÓLEO-1', 1)).toThrow(
            InvalidSupplyItemException,
        );
        expect(os.items).toHaveLength(0);
    });

    it('should not add supplies to a COMPLETED, DELIVERED, REJECTED, or CANCELLED order', () => {
        const completed = ServiceOrder.create(makeProps());
        completed.approve();
        completed.startExecution();
        completed.finish();
        completed.pullEvents();

        expect(() => completed.addSupply('PAST-FREIO-01', 2)).toThrow(
            InvalidServiceOrderStatusException,
        );
        expect(completed.items).toHaveLength(0);
        expect(completed.pullEvents()).toHaveLength(0);

        const delivered = ServiceOrder.create(
            makeProps({ id: 'os-delivered' }),
        );
        delivered.approve();
        delivered.startExecution();
        delivered.finish();
        delivered.deliver();
        delivered.pullEvents();

        expect(() => delivered.addSupply('PAST-FREIO-01', 2)).toThrow(
            InvalidServiceOrderStatusException,
        );
        expect(delivered.items).toHaveLength(0);
        expect(delivered.pullEvents()).toHaveLength(0);

        const rejected = ServiceOrder.create(makeProps({ id: 'os-rejected' }));
        rejected.awaitApproval('budget-1');
        rejected.reject();
        rejected.pullEvents();

        expect(() => rejected.addSupply('PAST-FREIO-01', 2)).toThrow(
            InvalidServiceOrderStatusException,
        );
        expect(rejected.items).toHaveLength(0);
        expect(rejected.pullEvents()).toHaveLength(0);

        const cancelled = ServiceOrder.create(makeProps({ id: 'os-2' }));
        cancelled.cancel();
        cancelled.pullEvents();

        expect(() => cancelled.addSupply('PAST-FREIO-01', 2)).toThrow(
            InvalidServiceOrderStatusException,
        );
        expect(cancelled.items).toHaveLength(0);
        expect(cancelled.pullEvents()).toHaveLength(0);
    });

    it('should mark a supply as used and record SupplyUsed', () => {
        const os = ServiceOrder.create(makeProps());
        os.addSupply('PAST-FREIO-01', 2);
        os.approve();
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

    it('should not mark supplies as used before approval', () => {
        const os = ServiceOrder.create(makeProps());
        os.addSupply('PAST-FREIO-01', 2);

        expect(() => os.markSupplyUsed('PAST-FREIO-01')).toThrow(
            InvalidServiceOrderStatusException,
        );
        expect(os.items[0]?.used).toBe(false);
    });

    it('should throw SupplyItemNotFoundException when item does not exist', () => {
        const os = ServiceOrder.create(makeProps());
        os.approve();

        expect(() => os.markSupplyUsed('PAST-FREIO-01')).toThrow(
            SupplyItemNotFoundException,
        );
    });

    it('should throw SupplyItemAlreadyUsedException when marking the same item twice', () => {
        const os = ServiceOrder.create(makeProps());
        os.addSupply('PAST-FREIO-01', 2);
        os.approve();
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

    it('should cancel a service order and record ServiceOrderCancelled', () => {
        const os = ServiceOrder.create(makeProps());
        os.pullEvents();

        os.cancel();

        expect(os.status.value).toBe('CANCELLED');
        const events = os.pullEvents();
        expect(events).toHaveLength(1);
        expect(events[0]?.eventName).toBe('service-order.cancelled');
        expect(events[0]?.aggregateId).toBe('os-1');
    });

    it('should not cancel a completed service order', () => {
        const os = ServiceOrder.create(makeProps());
        os.approve();
        os.startExecution();
        os.finish();

        expect(() => os.cancel()).toThrow(InvalidServiceOrderStatusException);
    });

    it('rejects only an order awaiting approval', () => {
        const os = ServiceOrder.create(makeProps());
        expect(() => os.reject()).toThrow(InvalidServiceOrderStatusException);
        os.awaitApproval('budget-1');
        os.reject();
        expect(os.status.value).toBe('REJECTED');
        expect(() => os.approve()).toThrow(InvalidServiceOrderStatusException);
    });

    it('delivers only a completed order', () => {
        const os = ServiceOrder.create(makeProps());
        expect(() => os.deliver()).toThrow(InvalidServiceOrderStatusException);
        os.approve();
        os.startExecution();
        os.finish();
        os.deliver();
        expect(os.status.value).toBe('DELIVERED');
        expect(() => os.deliver()).toThrow(InvalidServiceOrderStatusException);
    });

    it('should record ServiceOrderExecutionStarted when execution starts', () => {
        const os = ServiceOrder.create(makeProps());
        os.approve();

        os.startExecution();

        const events = os.pullEvents();
        expect(events).toHaveLength(1);
        expect(events[0]?.eventName).toBe('service-order.execution-started');
        expect(events[0]?.aggregateId).toBe('os-1');
    });

    it('should record ServiceOrderDelivered when the order is delivered', () => {
        const os = ServiceOrder.create(makeProps());
        os.approve();
        os.startExecution();
        os.finish();
        os.pullEvents();

        os.deliver();

        const events = os.pullEvents();
        expect(events).toHaveLength(1);
        expect(events[0]?.eventName).toBe('service-order.delivered');
        expect(events[0]?.aggregateId).toBe('os-1');
    });

    it('should not record events when a transition is rejected', () => {
        const os = ServiceOrder.create(makeProps());

        expect(() => os.startExecution()).toThrow(
            InvalidServiceOrderStatusException,
        );
        expect(() => os.deliver()).toThrow(InvalidServiceOrderStatusException);
        expect(os.pullEvents()).toHaveLength(0);
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

    const oilChange = {
        serviceId: 'svc-oil',
        name: 'Troca de óleo',
        priceCents: 12000,
    };

    it('should start without services and with zero total', () => {
        const os = ServiceOrder.create(makeProps());
        expect(os.services).toEqual([]);
        expect(os.totalCents).toBe(0);
    });

    it('should sum services and parts (quantity x unit price) in totalCents', () => {
        const os = ServiceOrder.create(makeProps());
        os.addService(oilChange);
        os.addService({
            serviceId: 'svc-align',
            name: 'Alinhamento',
            priceCents: 8000,
        });
        os.addSupply('OLEO-5W30', 4, {
            description: 'Óleo 5W30',
            unitPriceCents: 4500,
        });
        os.addSupply('FILTRO-01', 1);

        expect(os.services.map((s) => s.name)).toEqual([
            'Troca de óleo',
            'Alinhamento',
        ]);
        expect(os.items[0]?.description).toBe('Óleo 5W30');
        expect(os.items[0]?.totalCents).toBe(18000);
        expect(os.items[1]?.unitPriceCents).toBe(0);
        expect(os.totalCents).toBe(12000 + 8000 + 18000);
    });

    it('should reject a service included twice and remove services while PENDING', () => {
        const os = ServiceOrder.create(makeProps());
        os.addService(oilChange);
        expect(() => os.addService(oilChange)).toThrow(
            ServiceItemAlreadyAddedException,
        );

        os.removeService('svc-oil');
        expect(os.services).toEqual([]);
        expect(() => os.removeService('svc-oil')).toThrow(
            ServiceItemNotFoundException,
        );
    });

    it('should reject invalid service items', () => {
        const os = ServiceOrder.create(makeProps());
        for (const invalid of [
            { ...oilChange, serviceId: ' ' },
            { ...oilChange, name: '' },
            { ...oilChange, priceCents: -1 },
            { ...oilChange, priceCents: 1.5 },
        ]) {
            expect(() => os.addService(invalid)).toThrow(
                InvalidServiceItemException,
            );
        }
    });

    it('should reject a negative or fractional part unit price', () => {
        const os = ServiceOrder.create(makeProps());
        for (const unitPriceCents of [-1, 0.5]) {
            expect(() =>
                os.addSupply('OLEO-5W30', 1, { unitPriceCents }),
            ).toThrow(InvalidSupplyItemException);
        }
    });

    it('should not allow changing services once the order left PENDING', () => {
        const os = ServiceOrder.create(makeProps());
        os.addService(oilChange);
        os.awaitApproval('budget-1');
        expect(() =>
            os.addService({ ...oilChange, serviceId: 'svc-2' }),
        ).toThrow(InvalidServiceOrderStatusException);
        expect(() => os.removeService('svc-oil')).toThrow(
            InvalidServiceOrderStatusException,
        );
    });
});
