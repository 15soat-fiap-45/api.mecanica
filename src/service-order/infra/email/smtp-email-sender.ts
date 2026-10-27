import nodemailer, { type Transporter } from 'nodemailer';
import type {
    EmailMessage,
    EmailSender,
} from '../../application/ports/email-sender.js';

export class SmtpEmailSender implements EmailSender {
    private readonly transporter: Transporter;

    constructor(
        private readonly config: {
            host: string;
            port: number;
            from: string;
            user?: string | undefined;
            pass?: string | undefined;
            secure?: boolean | undefined;
        },
    ) {
        this.transporter = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure ?? false,
            auth: config.user
                ? { user: config.user, pass: config.pass }
                : undefined,
        });
    }

    async send(message: EmailMessage): Promise<void> {
        await this.transporter.sendMail({ from: this.config.from, ...message });
    }
}
