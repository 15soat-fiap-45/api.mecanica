export function readEmailConfig(
    env: Record<string, string | undefined> = process.env,
) {
    const ttlMinutes = Number(env.APPROVAL_TOKEN_TTL_MINUTES);
    const port = Number(env.SMTP_PORT);
    if (
        !Number.isSafeInteger(ttlMinutes) ||
        ttlMinutes <= 0 ||
        ttlMinutes > 525600 ||
        !env.APPROVAL_TOKEN_TTL_MINUTES ||
        !Number.isSafeInteger(port) ||
        port < 1 ||
        port > 65535 ||
        !env.SMTP_HOST ||
        !env.SMTP_FROM ||
        !env.FRONTEND_URL
    ) {
        throw new Error(
            'Set SMTP_HOST, SMTP_PORT, SMTP_FROM, FRONTEND_URL and positive APPROVAL_TOKEN_TTL_MINUTES.',
        );
    }
    const frontend = new URL(env.FRONTEND_URL);
    if (
        (frontend.protocol !== 'https:' &&
            !(
                frontend.protocol === 'http:' &&
                ['localhost', '127.0.0.1'].includes(frontend.hostname)
            )) ||
        frontend.username ||
        frontend.password
    ) {
        throw new Error(
            'FRONTEND_URL must be an HTTP(S) URL without credentials.',
        );
    }
    return {
        ttlMinutes,
        frontendUrl: frontend.origin,
        smtp: {
            host: env.SMTP_HOST,
            port,
            from: env.SMTP_FROM,
            secure: env.SMTP_SECURE === 'true',
            user: env.SMTP_USER,
            pass: env.SMTP_PASS,
        },
    };
}
