import { expect, it } from 'vitest';
import { SecurePasswordGenerator } from './secure-password-generator.js';

it('generates a valid alphanumeric temporary password', () => {
    const generator = new SecurePasswordGenerator();
    const password = generator.generate();
    expect(password).toMatch(/^[a-zA-Z0-9]{36}$/);
    expect(generator.generate()).not.toBe(password);
});
