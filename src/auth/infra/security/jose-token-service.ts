import { errors, jwtVerify, SignJWT } from 'jose';
import type { TokenService } from '../../application/token-service.js';

export class JoseTokenService implements TokenService {
    private readonly key: Uint8Array;

    constructor(secret: string) {
        this.key = new TextEncoder().encode(secret);
        if (this.key.length < 32) {
            throw new Error('JWT signing secret must be at least 32 bytes');
        }
    }

    sign(email: string): Promise<string> {
        return new SignJWT({})
            .setProtectedHeader({ alg: 'HS256' })
            .setSubject(email)
            .setIssuedAt()
            .setExpirationTime('4h')
            .sign(this.key);
    }

    async verify(token: string): Promise<string | null> {
        try {
            const { payload } = await jwtVerify(token, this.key, {
                algorithms: ['HS256'],
            });
            return payload.sub ?? null;
        } catch (error) {
            if (error instanceof errors.JOSEError) return null;
            throw error;
        }
    }
}
