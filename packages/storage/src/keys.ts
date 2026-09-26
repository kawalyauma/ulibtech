import { randomUUID } from 'node:crypto';
import { StorageKeyError, type StorageBucket } from './types';

const SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const BUCKETS: ReadonlySet<string> = new Set(['resources', 'thumbnails', 'previews', 'temporary', 'private']);

/** Validates a storage key. Rejects traversal, absolute paths, odd characters and unknown buckets. */
export function assertValidKey(key: string): void {
  if (typeof key !== 'string' || key.length === 0 || key.length > 400) {
    throw new StorageKeyError('Invalid storage key length');
  }
  if (key.includes('\\') || key.includes('\0') || key.startsWith('/')) {
    throw new StorageKeyError('Storage keys must be relative POSIX paths');
  }
  const segments = key.split('/');
  if (!BUCKETS.has(segments[0] ?? '')) {
    throw new StorageKeyError(`Unknown storage bucket in key: ${segments[0]}`);
  }
  for (const segment of segments) {
    if (segment === '.' || segment === '..' || !SEGMENT.test(segment)) {
      throw new StorageKeyError(`Invalid storage key segment: ${segment}`);
    }
  }
}

/** Builds a new random key such as `resources/2026/09/<uuid>.pdf`. */
export function buildKey(bucket: StorageBucket, extension: string, date = new Date()): string {
  const ext = extension.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8);
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${bucket}/${yyyy}/${mm}/${randomUUID()}${ext ? `.${ext}` : ''}`;
}
