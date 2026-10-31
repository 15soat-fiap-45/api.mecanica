import type { EmailMessage } from '../ports/email-sender.js';

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export interface BudgetServiceLine {
    name: string;
    priceCents: number;
}

export interface BudgetPartLine {
    partCode: string;
    description: string | null;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
}

const formatMoney = (cents: number) =>
    (cents / 100).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });

const sum = (values: number[]) => values.reduce((acc, v) => acc + v, 0);

export function buildBudgetApprovalEmail(data: {
    to: string;
    name: string;
    orderId: string;
    description: string;
    services: readonly BudgetServiceLine[];
    parts: readonly BudgetPartLine[];
    totalCents: number;
    expiresAt: Date;
    approveUrl: string;
    rejectUrl: string;
}): EmailMessage {
    const escape = escapeHtml;
    const servicesCents = sum(data.services.map((s) => s.priceCents));
    const partsCents = sum(data.parts.map((p) => p.totalCents));
    const partLabel = (part: BudgetPartLine) =>
        part.description
            ? `${part.description} (${part.partCode})`
            : part.partCode;
    const expires = data.expiresAt.toLocaleString('pt-BR', { timeZone: 'UTC' });

    const cell = 'style="border:1px solid #ccc;padding:4px 8px"';
    const right =
        'style="border:1px solid #ccc;padding:4px 8px;text-align:right"';
    const servicesHtml = data.services.length
        ? `<h3>Serviços</h3><table style="border-collapse:collapse"><tr><th ${cell}>Serviço</th><th ${right}>Valor</th></tr>${data.services
              .map(
                  (s) =>
                      `<tr><td ${cell}>${escape(s.name)}</td><td ${right}>${formatMoney(s.priceCents)}</td></tr>`,
              )
              .join(
                  '',
              )}<tr><td ${cell}><strong>Subtotal de serviços</strong></td><td ${right}><strong>${formatMoney(servicesCents)}</strong></td></tr></table>`
        : '';
    const partsHtml = data.parts.length
        ? `<h3>Peças e insumos</h3><table style="border-collapse:collapse"><tr><th ${cell}>Item</th><th ${right}>Qtd.</th><th ${right}>Valor unitário</th><th ${right}>Total</th></tr>${data.parts
              .map(
                  (p) =>
                      `<tr><td ${cell}>${escape(partLabel(p))}</td><td ${right}>${p.quantity}</td><td ${right}>${formatMoney(p.unitPriceCents)}</td><td ${right}>${formatMoney(p.totalCents)}</td></tr>`,
              )
              .join(
                  '',
              )}<tr><td ${cell} colspan="3"><strong>Subtotal de peças e insumos</strong></td><td ${right}><strong>${formatMoney(partsCents)}</strong></td></tr></table>`
        : '';

    const servicesText = data.services.length
        ? [
              'Serviços:',
              ...data.services.map(
                  (s) => `- ${s.name}: ${formatMoney(s.priceCents)}`,
              ),
              `Subtotal de serviços: ${formatMoney(servicesCents)}`,
          ]
        : [];
    const partsText = data.parts.length
        ? [
              'Peças e insumos:',
              ...data.parts.map(
                  (p) =>
                      `- ${partLabel(p)}: ${p.quantity} x ${formatMoney(p.unitPriceCents)} = ${formatMoney(p.totalCents)}`,
              ),
              `Subtotal de peças e insumos: ${formatMoney(partsCents)}`,
          ]
        : [];

    return {
        to: data.to,
        subject: `Orçamento da OS ${data.orderId} aguardando aprovação`,
        html: `<!doctype html><html lang="pt-BR"><body><h2>Orçamento da OS ${escape(data.orderId)}</h2><p>Olá, ${escape(data.name)}.</p><p>${escape(data.description)}</p>${servicesHtml}${partsHtml}<p><strong>Total do orçamento: ${formatMoney(data.totalCents)}</strong></p><p><a href="${escape(data.approveUrl)}">Aprovar orçamento</a> | <a href="${escape(data.rejectUrl)}">Recusar orçamento</a></p><p>Link válido até ${expires} (UTC), para uso único. A decisão só será registrada após confirmação na página.</p></body></html>`,
        text: [
            `Orçamento da OS ${data.orderId}`,
            `Olá, ${data.name}.`,
            data.description,
            ...servicesText,
            ...partsText,
            `Total do orçamento: ${formatMoney(data.totalCents)}`,
            `Aprovar: ${data.approveUrl}`,
            `Recusar: ${data.rejectUrl}`,
            `Link válido até ${expires} (UTC), para uso único. Confirme sua decisão na página.`,
        ].join('\n'),
    };
}
