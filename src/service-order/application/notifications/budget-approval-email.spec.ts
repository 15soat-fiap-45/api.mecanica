import { expect, it } from 'vitest';
import { buildBudgetApprovalEmail } from './budget-approval-email.js';

it('escapes user content in HTML and provides plain text with confirmation links', () => {
    const email = buildBudgetApprovalEmail({
        to: 'cliente@example.com',
        name: '<script>alert(1)</script>',
        orderId: 'os-1',
        description: '<img src=x onerror=alert(1)>',
        totalCents: 12345,
        expiresAt: new Date('2026-10-26T12:01:00Z'),
        approveUrl: 'https://example.com/orcamento/token?acao=aprovar&n=1',
        rejectUrl: 'https://example.com/orcamento/token?acao=recusar',
    });
    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<img');
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
