import { expect, it, vi } from 'vitest';
import { ServiceOrder } from '../../domain/service-order/service-order.js';
import { ServiceOrderFinished } from '../../domain/service-order/events/service-order-finished.js';
import { SendVehicleReadyEmail } from './send-vehicle-ready-email.js';

it('sends text and safe HTML to the vehicle owner after completion', async () => {
    const order = ServiceOrder.create({
        id: 'os-1',
        description: '<img src=x onerror=alert(1)>',
        vehicleId: 'vehicle-1',
    });
    order.approve();
    order.startExecution();
    order.finish();
    const emails: { to: string; html: string; text: string }[] = [];
    await new SendVehicleReadyEmail(
        { findById: vi.fn(async () => order), save: vi.fn() },
        {
            findByVehicleId: vi.fn(async () => ({
                name: '<Ana>',
                email: 'ana@example.com',
            })),
        },
        {
            send: vi.fn(async (email) => {
                emails.push(email);
            }),
        },
    ).handle(new ServiceOrderFinished({ aggregateId: 'os-1' }));
    expect(emails).toHaveLength(1);
    expect(emails[0]?.to).toBe('ana@example.com');
    expect(emails[0]?.html).toContain('&lt;Ana&gt;');
    expect(emails[0]?.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(emails[0]?.html).not.toContain('<img');
    expect(emails[0]?.html).toContain('Serviço finalizado!');
    expect(emails[0]?.text).toContain('pronto para retirada na oficina');
    expect(emails[0]?.text).toContain('os-1');
});
