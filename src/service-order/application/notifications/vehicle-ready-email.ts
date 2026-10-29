import type { EmailMessage } from '../ports/email-sender.js';
import { escapeHtml } from './budget-approval-email.js';

export function buildVehicleReadyEmail(data: {
    to: string;
    name: string;
    orderId: string;
    description: string;
}): EmailMessage {
    return {
        to: data.to,
        subject: `Veículo pronto para retirada - OS ${data.orderId}`,
        html: `<!doctype html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>Veículo pronto para retirada</title></head>
<body>
    <h2>Serviço finalizado!</h2>
    <p>Olá, ${escapeHtml(data.name)}.</p>
    <p>O serviço do seu veículo foi finalizado e ele está pronto para retirada na oficina.</p>
    <p><strong>Ordem de serviço:</strong> ${escapeHtml(data.orderId)}</p>
    <p><strong>Descrição:</strong> ${escapeHtml(data.description)}</p>
    <p>Você já pode vir buscar seu carro na oficina.</p>
    <p>Agradecemos pela confiança!</p>
</body>
</html>`,
        text: `Serviço finalizado!\nOlá, ${data.name}.\nO serviço do seu veículo foi finalizado e ele está pronto para retirada na oficina.\nOrdem de serviço: ${data.orderId}\nDescrição: ${data.description}\nVocê já pode vir buscar seu carro na oficina.\nAgradecemos pela confiança!`,
    };
}
