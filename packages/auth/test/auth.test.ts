import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword, hashToken, generateToken, hasPermission, safeEqual } from '../src';

describe('password hashing', () => {
  it('uses argon2id and verifies correctly', async () => {
    const h = await hashPassword('Correct horse 42');
    expect(h.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(h, 'Correct horse 42')).toBe(true);
    expect(await verifyPassword(h, 'wrong')).toBe(false);
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
  });
});

describe('tokens', () => {
  it('generates unique url-safe tokens and stable hashes', () => {
    const a = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(generateToken());
    expect(hashToken(a)).toHaveLength(64);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
  });
});

describe('permissions', () => {
  it('requires all listed permissions', () => {
    expect(hasPermission(['resources.read', 'resources.create'], 'resources.read')).toBe(true);
    expect(hasPermission(['resources.read'], ['resources.read', 'resources.delete'])).toBe(false);
  });
});
