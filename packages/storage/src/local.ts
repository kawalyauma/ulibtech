import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import { assertValidKey } from './keys';
import {
  StorageKeyError,
  StorageNotFoundError,
  type ByteRange,
  type OpenedObject,
  type StorageObjectMetadata,
  type StorageProvider,
  type UploadOptions,
} from './types';

export interface LocalStorageOptions {
  root: string;
  /** URL prefix configured in Nginx as an `internal` location, e.g. `/_protected/`. */
  accelPrefix?: string | null;
}

/** Stores files on the local filesystem beneath a root directory. */
export class LocalFilesystemStorageProvider implements StorageProvider {
  readonly name = 'local';
  private readonly root: string;
  private readonly accelPrefix: string | null;

  constructor(options: LocalStorageOptions) {
    this.root = path.resolve(options.root);
    this.accelPrefix = options.accelPrefix ?? null;
  }

  localPath(key: string): string {
    assertValidKey(key);
    const full = path.resolve(this.root, key);
    // Defence in depth: the resolved path must remain within the root.
    if (full !== this.root && !full.startsWith(this.root + path.sep)) {
      throw new StorageKeyError('Resolved path escapes the storage root');
    }
    return full;
  }

  accelRedirectPath(key: string): string | null {
    if (!this.accelPrefix) return null;
    assertValidKey(key);
    return `${this.accelPrefix.replace(/\/$/, '')}/${key}`;
  }

  async upload(key: string, body: Buffer | Readable, options: UploadOptions = {}): Promise<StorageObjectMetadata> {
    const target = this.localPath(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    if (options.noOverwrite && (await this.exists(key))) {
      throw new StorageKeyError(`Object already exists: ${key}`);
    }
    // Write to a sibling temp file then rename so readers never see partial files.
    const tmp = `${target}.${randomUUID()}.part`;
    try {
      const source = Buffer.isBuffer(body) ? Readable.from([body]) : body;
      await pipeline(source, createWriteStream(tmp, { flags: 'wx', mode: 0o640 }));
      await fs.rename(tmp, target);
    } catch (err) {
      await fs.rm(tmp, { force: true });
      throw err;
    }
    const stat = await fs.stat(target);
    return { key, size: stat.size, modifiedAt: stat.mtime, contentType: options.contentType };
  }

  async open(key: string, range?: ByteRange): Promise<OpenedObject> {
    const file = this.localPath(key);
    const stat = await fs.stat(file).catch(() => null);
    if (!stat || !stat.isFile()) throw new StorageNotFoundError(key);
    if (range) {
      const end = Math.min(range.end, stat.size - 1);
      if (range.start < 0 || range.start > end) {
        throw new RangeError('Unsatisfiable range');
      }
      return {
        stream: createReadStream(file, { start: range.start, end }),
        size: stat.size,
        range: { start: range.start, end },
      };
    }
    return { stream: createReadStream(file), size: stat.size, range: null };
  }

  async stream(key: string, range?: ByteRange): Promise<Readable> {
    return (await this.open(key, range)).stream;
  }

  async read(key: string): Promise<Buffer> {
    try {
      return await fs.readFile(this.localPath(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new StorageNotFoundError(key);
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.localPath(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      const stat = await fs.stat(this.localPath(key));
      return stat.isFile();
    } catch {
      return false;
    }
  }

  async move(fromKey: string, toKey: string): Promise<void> {
    const from = this.localPath(fromKey);
    const to = this.localPath(toKey);
    await fs.mkdir(path.dirname(to), { recursive: true });
    try {
      await fs.rename(from, to);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
        await fs.copyFile(from, to);
        await fs.rm(from, { force: true });
        return;
      }
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new StorageNotFoundError(fromKey);
      throw err;
    }
  }

  async getMetadata(key: string): Promise<StorageObjectMetadata | null> {
    try {
      const stat = await fs.stat(this.localPath(key));
      if (!stat.isFile()) return null;
      return { key, size: stat.size, modifiedAt: stat.mtime };
    } catch {
      return null;
    }
  }

  /** Lists keys under a prefix (used for maintenance such as temp cleanup). */
  async list(prefix: string): Promise<StorageObjectMetadata[]> {
    const dir = this.localPath(prefix);
    const out: StorageObjectMetadata[] = [];
    const walk = async (current: string) => {
      const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.isFile()) {
          const stat = await fs.stat(full);
          out.push({ key: path.relative(this.root, full).split(path.sep).join('/'), size: stat.size, modifiedAt: stat.mtime });
        }
      }
    };
    await walk(dir);
    return out;
  }
}
