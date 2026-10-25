import { describe, expect, it } from 'vitest';
import { InvalidPasswordException, Password } from './password.js';

describe('Password', () => {
    it.each(['abcdefgh', 'ABC12345', '12345678'])(
        'accepts at least eight alphanumeric characters: %s',
        (value) => {
            const password = Password.create(value);
            expect(password.value).toBe(value);
            expect(Object.isFrozen(password)).toBe(true);
        },
    );

    it.each([
        'short12',
        'abcdefgh!',
        '        ',
        'àbcdefgh',
        ' abcdefgh',
        42,
        null,
    ])('rejects invalid input: %s', (value) => {
        expect(() => Password.create(value as string)).toThrow(
            InvalidPasswordException,
        );
    });
});
