import type { EmailMessage } from '../ports/email-sender.js';

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function buildBudgetApprovalEmail(data: {
    to: string;
    name: string;
    orderId: string;
    description: string;
    totalCents: number;
    expiresAt: Date;
    approveUrl: string;
    rejectUrl: string;
}): EmailMessage {
    const escape = escapeHtml;
    const money = (data.totalCents / 100).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
    const expires = data.expiresAt.toLocaleString('pt-BR', { timeZone: 'UTC' });
    return {
        to: data.to,
        subject: `Orçamento da OS ${data.orderId} aguardando aprovação`,
        html: `<!doctype html><html lang="pt-BR"><body><h2>Orçamento da OS ${escape(data.orderId)}</h2><p>Olá, ${escape(data.name)}.</p><p>${escape(data.description)}</p><p>Total: ${money}</p><p><a href="${escape(data.approveUrl)}">Aprovar orçamento</a> | <a href="${escape(data.rejectUrl)}">Recusar orçamento</a></p><p>Link válido até ${expires} (UTC), para uso único. A decisão só será registrada após confirmação na página.</p></body></html>`,
        text: `Orçamento da OS ${data.orderId}\nOlá, ${data.name}.\n${data.description}\nTotal: ${money}\nAprovar: ${data.approveUrl}\nRecusar: ${data.rejectUrl}\nLink válido até ${expires} (UTC), para uso único. Confirme sua decisão na página.`,
    };
}
