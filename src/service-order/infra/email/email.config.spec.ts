import { expect, it } from 'vitest';
import { readEmailConfig } from './email.config.js';

it('uses a positive integer token lifetime in minutes from the environment', () => {
    const config = readEmailConfig({
        SMTP_HOST: 'localhost',
        SMTP_PORT: '1025',
        SMTP_FROM: 'oficina@localhost',
        FRONTEND_URL: 'http://localhost:3000',
        APPROVAL_TOKEN_TTL_MINUTES: '15',
    });
    expect(config.ttlMinutes).toBe(15);
    expect(config.smtp.port).toBe(1025);
    for (const value of ['0', '-1', '1.5', 'NaN', '', '999999999999']) {
        expect(() =>
            readEmailConfig({
                SMTP_HOST: 'localhost',
                SMTP_PORT: '1025',
                SMTP_FROM: 'oficina@localhost',
                FRONTEND_URL: 'http://localhost:3000',
                APPROVAL_TOKEN_TTL_MINUTES: value,
            }),
        ).toThrow();
    }
});

it('does not send approval tokens over unencrypted links outside localhost', () => {
    expect(() =>
        readEmailConfig({
            SMTP_HOST: 'localhost',
            SMTP_PORT: '1025',
            SMTP_FROM: 'oficina@localhost',
            FRONTEND_URL: 'http://example.com',
            APPROVAL_TOKEN_TTL_MINUTES: '15',
        }),
    ).toThrow();
});
