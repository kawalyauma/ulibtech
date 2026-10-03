'use client';

import type { ApiErrorBody } from '@edushare/shared';

let csrfToken: string | null = null;
export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (
    res.status === 401 &&
    typeof window !== 'undefined' &&
    !window.location.pathname.startsWith('/login')
  ) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  }
  if (!res.ok) {
    let body: Partial<ApiErrorBody> = {};
    try {
      body = await res.json();
    } catch {
      /* not JSON */
    }
    const details = body.error?.details as { fields?: Record<string, string> } | undefined;
    throw new ApiRequestError(
      res.status,
      body.error?.code ?? 'HTTP_ERROR',
      body.error?.message ?? `Request failed (${res.status})`,
      details?.fields,
    );
  }
  return (await res.json()) as T;
}

function headers(json: boolean): HeadersInit {
  return {
    ...(json ? { 'content-type': 'application/json' } : {}),
    ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
  };
}

export const api = {
  get: <T>(path: string) =>
    fetch(`/api/admin${path}`, { credentials: 'same-origin', cache: 'no-store' }).then((r) =>
      handle<T>(r),
    ),
  post: <T>(path: string, body?: unknown) =>
    fetch(`/api/admin${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: headers(true),
      body: JSON.stringify(body ?? {}),
    }).then((r) => handle<T>(r)),
  patch: <T>(path: string, body: unknown) =>
    fetch(`/api/admin${path}`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: headers(true),
      body: JSON.stringify(body),
    }).then((r) => handle<T>(r)),
  put: <T>(path: string, body: unknown) =>
    fetch(`/api/admin${path}`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: headers(true),
      body: JSON.stringify(body),
    }).then((r) => handle<T>(r)),
  delete: <T>(path: string) =>
    fetch(`/api/admin${path}`, {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: headers(false),
    }).then((r) => handle<T>(r)),
  /** Multipart upload with progress reporting (XMLHttpRequest supports upload progress). */
  upload: <T>(path: string, form: FormData, onProgress?: (fraction: number) => void) =>
    new Promise<T>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/admin${path}`);
      xhr.withCredentials = true;
      if (csrfToken) xhr.setRequestHeader('x-csrf-token', csrfToken);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onerror = () =>
        reject(
          new ApiRequestError(0, 'NETWORK', 'Network error. Check your connection and retry.'),
        );
      xhr.onload = () => {
        const res = new Response(xhr.responseText, {
          status: xhr.status,
          headers: { 'content-type': 'application/json' },
        });
        handle<T>(res).then(resolve, reject);
      };
      xhr.send(form);
    }),
};

/**
 * PUT one raw chunk (used by resumable zip uploads), with per-chunk upload progress.
 * Network failures reject with status 0 so callers can retry.
 */
export function uploadChunk(path: string, blob: Blob, onProgress?: (bytes: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `/api/admin${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('content-type', 'application/octet-stream');
    if (csrfToken) xhr.setRequestHeader('x-csrf-token', csrfToken);
    xhr.upload.onprogress = (e) => onProgress?.(e.loaded);
    xhr.onerror = () => reject(new ApiRequestError(0, 'NETWORK', 'Network error'));
    xhr.ontimeout = () => reject(new ApiRequestError(0, 'NETWORK', 'Network timeout'));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      const res = new Response(xhr.responseText || '{}', {
        status: xhr.status,
        headers: { 'content-type': 'application/json' },
      });
      handle<unknown>(res).then(() => resolve(), reject);
    };
    xhr.timeout = 10 * 60_000;
    xhr.send(blob);
  });
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}
