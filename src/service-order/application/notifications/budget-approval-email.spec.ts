import { expect, it } from 'vitest';
import { buildBudgetApprovalEmail } from './budget-approval-email.js';

const base = {
    to: 'cliente@example.com',
    orderId: 'os-1',
    expiresAt: new Date('2026-10-26T12:01:00Z'),
    approveUrl: 'https://example.com/orcamento/token?acao=aprovar&n=1',
    rejectUrl: 'https://example.com/orcamento/token?acao=recusar',
};

it('escapes user content in HTML and provides plain text with confirmation links', () => {
    const email = buildBudgetApprovalEmail({
        ...base,
        name: '<script>alert(1)</script>',
        description: '<img src=x onerror=alert(1)>',
        services: [{ name: '<b>Troca</b>', priceCents: 12345 }],
        parts: [],
        totalCents: 12345,
    });
    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<img');
    expect(email.html).not.toContain('<b>Troca');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).toContain('acao=aprovar&amp;n=1');
    expect(email.text).toContain('<img src=x onerror=alert(1)>');
    expect(email.text).toContain('R$');
    expect(email.text).toContain(
        'Aprovar: https://example.com/orcamento/token?acao=aprovar&n=1',
    );
    expect(email.text).toContain(
        'Recusar: https://example.com/orcamento/token?acao=recusar',
    );
});

it('details services, parts, subtotals and total of the budget', () => {
    const email = buildBudgetApprovalEmail({
        ...base,
        name: 'Ana',
        description: 'Barulho ao frear',
        services: [
            { name: 'Troca de pastilhas', priceCents: 18000 },
            { name: 'Alinhamento', priceCents: 8000 },
        ],
        parts: [
            {
                partCode: 'PAST-FREIO-01',
                description: 'Pastilha dianteira',
                quantity: 2,
                unitPriceCents: 8500,
                totalCents: 17000,
            },
            {
                partCode: 'FLUIDO-DOT4',
                description: null,
                quantity: 1,
                unitPriceCents: 4000,
                totalCents: 4000,
            },
        ],
        totalCents: 47000,
    });
    const money = (cents: number) =>
        (cents / 100).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        });

    expect(email.text).toContain(`- Troca de pastilhas: ${money(18000)}`);
    expect(email.text).toContain(`- Alinhamento: ${money(8000)}`);
    expect(email.text).toContain(`Subtotal de serviços: ${money(26000)}`);
    expect(email.text).toContain(
        `- Pastilha dianteira (PAST-FREIO-01): 2 x ${money(8500)} = ${money(17000)}`,
    );
    expect(email.text).toContain(
        `- FLUIDO-DOT4: 1 x ${money(4000)} = ${money(4000)}`,
    );
    expect(email.text).toContain(
        `Subtotal de peças e insumos: ${money(21000)}`,
    );
    expect(email.text).toContain(`Total do orçamento: ${money(47000)}`);
    expect(email.html).toContain('<h3>Serviços</h3>');
    expect(email.html).toContain('<h3>Peças e insumos</h3>');
    expect(email.html).toContain('Pastilha dianteira (PAST-FREIO-01)');
});

it('omits the parts section when the budget has only services', () => {
    const email = buildBudgetApprovalEmail({
        ...base,
        name: 'Ana',
        description: 'Revisão',
        services: [{ name: 'Revisão', priceCents: 30000 }],
        parts: [],
        totalCents: 30000,
    });
    expect(email.text).not.toContain('Peças e insumos');
    expect(email.html).not.toContain('Peças e insumos');
});
