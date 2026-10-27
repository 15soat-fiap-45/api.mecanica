import { expect, it } from 'vitest';
import { EntityId } from '../../../shared/domain/entity-id.js';
import { UserId } from './user-id.js';

it('creates distinct UUIDv4 entity IDs and restores existing ones', () => {
    const first = new UserId();
    const second = new UserId();
    expect(first).toBeInstanceOf(EntityId);
    expect(first.value).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(first.equals(second)).toBe(false);
    expect(new UserId(first.value).equals(first)).toBe(true);
    expect(() => new UserId('not-a-uuid')).toThrow();
    expect(() => new UserId('00000000-0000-1000-8000-000000000000')).toThrow();
});
