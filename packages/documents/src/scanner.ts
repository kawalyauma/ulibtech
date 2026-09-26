import net from 'node:net';
import { createReadStream } from 'node:fs';

export type ScanVerdict = { status: 'clean' | 'skipped' | 'infected'; signature?: string };

/** Malware scanning hook. Swap in a real scanner via CLAMAV_HOST without touching callers. */
export interface FileScanner {
  readonly name: string;
  scan(path: string): Promise<ScanVerdict>;
}

export class NoopScanner implements FileScanner {
  readonly name = 'noop';
  async scan(): Promise<ScanVerdict> {
    return { status: 'skipped' };
  }
}

/** Minimal clamd INSTREAM client. */
export class ClamdScanner implements FileScanner {
  readonly name = 'clamd';
  constructor(
    private readonly host: string,
    private readonly port = 3310,
    private readonly timeoutMs = 60_000,
  ) {}

  scan(path: string): Promise<ScanVerdict> {
    return new Promise((resolve, reject) => {
      const socket = net.connect(this.port, this.host);
      socket.setTimeout(this.timeoutMs, () => socket.destroy(new Error('clamd timeout')));
      let response = '';
      socket.on('data', (d) => (response += d.toString()));
      socket.on('error', reject);
      socket.on('close', () => {
        if (/OK\0?\s*$/.test(response)) resolve({ status: 'clean' });
        else if (/FOUND/.test(response))
          resolve({
            status: 'infected',
            signature: response.replace(/^stream:\s*|\s*FOUND.*$/g, ''),
          });
        else reject(new Error(`Unexpected clamd response: ${response}`));
      });
      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        const stream = createReadStream(path, { highWaterMark: 64 * 1024 });
        stream.on('data', (chunk) => {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          const size = Buffer.alloc(4);
          size.writeUInt32BE(buf.length);
          socket.write(size);
          socket.write(buf);
        });
        stream.on('end', () => socket.write(Buffer.alloc(4)));
        stream.on('error', reject);
      });
    });
  }
}

export function getScanner(): FileScanner {
  const host = process.env.CLAMAV_HOST;
  return host ? new ClamdScanner(host, Number(process.env.CLAMAV_PORT ?? 3310)) : new NoopScanner();
}
