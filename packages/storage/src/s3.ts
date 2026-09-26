import { type Readable } from 'node:stream';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  NotFound,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { assertValidKey } from './keys';
import {
  StorageNotFoundError,
  type ByteRange,
  type OpenedObject,
  type StorageObjectMetadata,
  type StorageProvider,
  type UploadOptions,
} from './types';

export interface S3StorageOptions {
  bucket: string;
  region?: string;
  /** Custom endpoint for MinIO, Cloudflare R2, SeaweedFS, etc. */
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
  /** Optional key prefix inside the bucket (e.g. "edushare/"). */
  prefix?: string;
}

function isNotFound(err: unknown): boolean {
  return err instanceof NoSuchKey || err instanceof NotFound || (err as { name?: string }).name === 'NotFound' || (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404;
}

/** S3-compatible object storage (AWS S3, MinIO, Cloudflare R2, SeaweedFS…). */
export class S3StorageProvider implements StorageProvider {
  readonly name = 's3';
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly prefix: string;

  constructor(options: S3StorageOptions, client?: S3Client) {
    const config: S3ClientConfig = {
      region: options.region ?? 'us-east-1',
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle,
      // Non-AWS S3 implementations often reject the SDK's default streaming checksum trailers.
      ...(options.endpoint ? { requestChecksumCalculation: 'WHEN_REQUIRED' as const, responseChecksumValidation: 'WHEN_REQUIRED' as const } : {}),
      credentials: options.accessKeyId && options.secretAccessKey ? { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey } : undefined,
    };
    this.client = client ?? new S3Client(config);
    this.bucket = options.bucket;
    this.prefix = options.prefix ? options.prefix.replace(/\/?$/, '/') : '';
  }

  private k(key: string): string {
    assertValidKey(key);
    return `${this.prefix}${key}`;
  }

  async upload(key: string, body: Buffer | Readable, options: UploadOptions = {}): Promise<StorageObjectMetadata> {
    if (options.noOverwrite && (await this.exists(key))) throw new Error(`Object already exists: ${key}`);
    await new Upload({
      client: this.client,
      params: { Bucket: this.bucket, Key: this.k(key), Body: body, ContentType: options.contentType },
      queueSize: 4,
      partSize: 8 * 1024 * 1024,
    }).done();
    const meta = await this.getMetadata(key);
    if (!meta) throw new Error(`Upload of ${key} could not be verified`);
    return meta;
  }

  async open(key: string, range?: ByteRange): Promise<OpenedObject> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.k(key), Range: range ? `bytes=${range.start}-${range.end}` : undefined }),
      );
      const body = res.Body as Readable;
      if (range) {
        const m = /bytes (\d+)-(\d+)\/(\d+)/.exec(res.ContentRange ?? '');
        const size = Number(m?.[3] ?? res.ContentLength ?? 0);
        return { stream: body, size, range: { start: Number(m?.[1] ?? range.start), end: Number(m?.[2] ?? range.end) } };
      }
      return { stream: body, size: Number(res.ContentLength ?? 0), range: null };
    } catch (err) {
      if (isNotFound(err)) throw new StorageNotFoundError(key);
      if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 416) throw new RangeError('Unsatisfiable range');
      throw err;
    }
  }

  async stream(key: string, range?: ByteRange): Promise<Readable> {
    return (await this.open(key, range)).stream;
  }

  async read(key: string): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const c of await this.stream(key)) chunks.push(Buffer.from(c as Buffer));
    return Buffer.concat(chunks);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.k(key) }));
  }

  async exists(key: string): Promise<boolean> {
    return (await this.getMetadata(key)) !== null;
  }

  async move(fromKey: string, toKey: string): Promise<void> {
    try {
      await this.client.send(
        new CopyObjectCommand({ Bucket: this.bucket, Key: this.k(toKey), CopySource: `${this.bucket}/${encodeURIComponent(this.k(fromKey)).replace(/%2F/g, '/')}` }),
      );
    } catch (err) {
      if (isNotFound(err)) throw new StorageNotFoundError(fromKey);
      throw err;
    }
    await this.delete(fromKey);
  }

  async getMetadata(key: string): Promise<StorageObjectMetadata | null> {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: this.k(key) }));
      return { key, size: Number(res.ContentLength ?? 0), modifiedAt: res.LastModified ?? new Date(0), contentType: res.ContentType };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  /** Time-limited direct download link (used when S3_PRESIGNED_DOWNLOADS=true). */
  async presignedUrl(key: string, opts: { fileName?: string; contentType?: string; inline?: boolean; expiresIn?: number } = {}): Promise<string> {
    const disposition = opts.fileName
      ? `${opts.inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(opts.fileName)}`
      : undefined;
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: this.k(key), ResponseContentDisposition: disposition, ResponseContentType: opts.contentType }),
      { expiresIn: opts.expiresIn ?? 300 },
    );
  }

  async list(prefix: string): Promise<StorageObjectMetadata[]> {
    const out: StorageObjectMetadata[] = [];
    let token: string | undefined;
    do {
      const res = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: this.k(prefix), ContinuationToken: token }));
      for (const o of res.Contents ?? []) {
        if (o.Key) out.push({ key: o.Key.slice(this.prefix.length), size: Number(o.Size ?? 0), modifiedAt: o.LastModified ?? new Date(0) });
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return out;
  }
}
