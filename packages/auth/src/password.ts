import { hash, verify, type Algorithm } from '@node-rs/argon2';

/** Algorithm.Argon2id (const enum; inlined for isolatedModules). */
const ARGON2ID = 2 as Algorithm;

// OWASP-recommended Argon2id parameters (19 MiB, t=2, p=1).
const OPTIONS = { algorithm: ARGON2ID, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** A valid hash used to equalise timing when the account does not exist. */
let dummyHash: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword('dummy-password-for-timing');
  return dummyHash;
}
