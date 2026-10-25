import { expect, it } from 'vitest';
import { Argon2PasswordHasher } from './argon2-password-hasher.js';

it('hashes passwords with Argon2 and verifies only the matching input', async () => {
    const hasher = new Argon2PasswordHasher();
    const hash = await hasher.hash('TempPass123');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('TempPass123');
    expect(await hasher.verify('TempPass123', hash)).toBe(true);
    expect(await hasher.verify('WrongPass123', hash)).toBe(false);
});
