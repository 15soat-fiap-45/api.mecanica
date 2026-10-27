import { randomBytes } from 'node:crypto';
import type { PasswordGenerator } from '../../domain/services/password-generator.js';

export class SecurePasswordGenerator implements PasswordGenerator {
    generate(): string {
        return randomBytes(18).toString('hex');
    }
}
