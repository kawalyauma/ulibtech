import { Readable } from 'node:stream';
import {
  StorageNotFoundError,
  type ByteRange,
  type OpenedObject,
  type StorageObjectMetadata,
  type StorageProvider,
  type UploadOptions,
} from './types';

const PREFIX = 'nexdrive/';

function nodeId(key: string): string {
  const id = key.startsWith(PREFIX) ? key.slice(PREFIX.length) : '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error(`Invalid NexDrive storage key: ${key}`);
  return id;
}

/** Read-through storage for files owned by the configured NexDrive workspace. */
export class NexDriveStorageProvider implements StorageProvider {
  readonly name = 'nexdrive';
  constructor(
    private readonly baseUrl: string,
    private readonly workspaceId: string,
    private readonly apiKey: string,
  ) {}

  private url(id: string, suffix = '') {
    return `${this.baseUrl.replace(/\/$/, '')}/api/workspaces/${this.workspaceId}/nodes/${id}${suffix}`;
  }
  private headers(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${this.apiKey}`, ...extra };
  }

  async getMetadata(key: string): Promise<StorageObjectMetadata | null> {
    const response = await fetch(this.url(nodeId(key)), { headers: this.headers() });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`NexDrive metadata failed (${response.status})`);
    const item = (await response.json()) as {
      size_bytes: string | number; mime_type?: string; updated_at: string;
    };
    return { key, size: Number(item.size_bytes), modifiedAt: new Date(item.updated_at), contentType: item.mime_type || undefined };
  }

  async open(key: string, range?: ByteRange): Promise<OpenedObject> {
    const response = await fetch(this.url(nodeId(key), '/download'), {
      headers: this.headers(range ? { Range: `bytes=${range.start}-${range.end}` } : {}),
    });
    if (response.status === 404) throw new StorageNotFoundError(key);
    if (!response.ok || !response.body) throw new Error(`NexDrive download failed (${response.status})`);
    const contentRange = response.headers.get('content-range');
    const total = Number(contentRange?.split('/')[1] || response.headers.get('x-file-size') || response.headers.get('content-length') || 0);
    const end = contentRange ? Number(contentRange.match(/-(\d+)\//)?.[1]) : undefined;
    return {
      stream: Readable.fromWeb(response.body as import('node:stream/web').ReadableStream),
      size: total,
      range: response.status === 206 && range ? { start: range.start, end: end ?? range.end } : null,
    };
  }
  async stream(key: string, range?: ByteRange) { return (await this.open(key, range)).stream; }
  async read(key: string): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of await this.stream(key)) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
  async exists(key: string) { return Boolean(await this.getMetadata(key)); }
  async delete(key: string): Promise<void> {
    const id = nodeId(key);
    const trash = await fetch(this.url(id, '/trash'), { method: 'POST', headers: this.headers() });
    if (!trash.ok && trash.status !== 404) throw new Error(`NexDrive trash failed (${trash.status})`);
    if (trash.status !== 404) {
      const purged = await fetch(this.url(id), { method: 'DELETE', headers: this.headers() });
      if (!purged.ok && purged.status !== 404) throw new Error(`NexDrive delete failed (${purged.status})`);
    }
  }
  async upload(_key: string, _body: Buffer | Readable, _options?: UploadOptions): Promise<StorageObjectMetadata> {
    throw new Error('Direct NexDrive uploads must be created through the NexDrive integration');
  }
  async move(): Promise<void> { throw new Error('NexDrive objects cannot be moved by storage key'); }
}

export class RoutedStorageProvider implements StorageProvider {
  readonly name = 'routed';
  constructor(private readonly primary: StorageProvider, private readonly nexdrive: StorageProvider) {}
  private provider(key: string) { return key.startsWith(PREFIX) ? this.nexdrive : this.primary; }
  upload(key: string, body: Buffer | Readable, options?: UploadOptions) { return this.provider(key).upload(key, body, options); }
  open(key: string, range?: ByteRange) { return this.provider(key).open(key, range); }
  stream(key: string, range?: ByteRange) { return this.provider(key).stream(key, range); }
  read(key: string) { return this.provider(key).read(key); }
  delete(key: string) { return this.provider(key).delete(key); }
  exists(key: string) { return this.provider(key).exists(key); }
  getMetadata(key: string) { return this.provider(key).getMetadata(key); }
  async move(fromKey: string, toKey: string) {
    const from = this.provider(fromKey), to = this.provider(toKey);
    if (from === to) return from.move(fromKey, toKey);
    const opened = await from.open(fromKey);
    await to.upload(toKey, opened.stream);
    await from.delete(fromKey);
  }
  localPath(key: string) { return this.provider(key).localPath?.(key) ?? ''; }
  accelRedirectPath(key: string) { return this.provider(key).accelRedirectPath?.(key) ?? null; }
}
