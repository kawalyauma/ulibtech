import type { Readable } from 'node:stream';

export type StorageBucket = 'resources' | 'thumbnails' | 'previews' | 'temporary' | 'private';

export interface StorageObjectMetadata {
  key: string;
  size: number;
  modifiedAt: Date;
  contentType?: string;
}

export interface UploadOptions {
  contentType?: string;
  /** Fail instead of overwriting an existing object. */
  noOverwrite?: boolean;
}

export interface ByteRange {
  start: number;
  /** Inclusive end offset. */
  end: number;
}

export interface OpenedObject {
  stream: Readable;
  size: number;
  range: ByteRange | null;
}

/**
 * Storage abstraction. Keys are POSIX-style relative paths such as
 * `resources/2026/09/abc.pdf`. Implementations must reject keys that escape the root.
 */
export interface StorageProvider {
  readonly name: string;
  upload(key: string, body: Buffer | Readable, options?: UploadOptions): Promise<StorageObjectMetadata>;
  /** Opens an object for reading, optionally for a byte range. */
  open(key: string, range?: ByteRange): Promise<OpenedObject>;
  /** Convenience: readable stream of the whole object (or range). */
  stream(key: string, range?: ByteRange): Promise<Readable>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  move(fromKey: string, toKey: string): Promise<void>;
  getMetadata(key: string): Promise<StorageObjectMetadata | null>;
  /** Absolute local path when the provider is filesystem backed (used by processors). */
  localPath?(key: string): string;
  /** Internal path for Nginx X-Accel-Redirect, when supported. */
  accelRedirectPath?(key: string): string | null;
  /** Direct, time-limited URL (object storage); callers redirect instead of streaming. */
  presignedUrl?(key: string, opts?: { fileName?: string; contentType?: string; inline?: boolean; expiresIn?: number }): Promise<string>;
  /** Lists objects under a key prefix (maintenance jobs). */
  list?(prefix: string): Promise<StorageObjectMetadata[]>;
}

export class StorageKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageKeyError';
  }
}

export class StorageNotFoundError extends Error {
  constructor(key: string) {
    super(`Storage object not found: ${key}`);
    this.name = 'StorageNotFoundError';
  }
}
