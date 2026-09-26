import type { ByteRange } from '@edushare/storage';

/** Parses a single-range `Range: bytes=start-end` header. Multi-range is not supported. */
export function parseRange(header: string | undefined, size: number): ByteRange | 'invalid' | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return 'invalid';
  const [, s, e] = m;
  if (s === '' && e === '') return 'invalid';
  let start: number;
  let end: number;
  if (s === '') {
    const suffix = Number(e);
    if (suffix === 0) return 'invalid';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(s);
    end = e === '' ? size - 1 : Math.min(Number(e), size - 1);
  }
  if (start >= size || start > end) return 'invalid';
  return { start, end };
}
