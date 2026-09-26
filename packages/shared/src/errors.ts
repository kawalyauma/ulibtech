export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'RATE_LIMITED'
  | 'FILE_MISSING'
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMITED: 429,
  FILE_MISSING: 410,
  INTERNAL: 500,
};

/** Domain error that maps cleanly to an HTTP response. Messages are safe to show users. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }

  static notFound(what = 'Resource') {
    return new AppError('NOT_FOUND', `${what} not found`);
  }
  static badRequest(message: string, details?: unknown) {
    return new AppError('BAD_REQUEST', message, details);
  }
  static conflict(message: string, details?: unknown) {
    return new AppError('CONFLICT', message, details);
  }
  static forbidden(message = 'You do not have permission to perform this action') {
    return new AppError('FORBIDDEN', message);
  }
  static unauthenticated(message = 'Please sign in') {
    return new AppError('UNAUTHENTICATED', message);
  }
}

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
