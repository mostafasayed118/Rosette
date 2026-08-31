import { NextResponse } from 'next/server';

export type AppErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'unavailable';

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  unavailable: 503,
};

/** Stable error contract for route handlers; internal causes never reach clients. */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;

  constructor(code: AppErrorCode, message: string, options?: { cause?: unknown; status?: number }) {
    super(message, options);
    this.name = 'AppError';
    this.code = code;
    this.status = options?.status ?? STATUS_BY_CODE[code];
  }
}

export function toRouteError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  return new AppError('unavailable', 'The service is temporarily unavailable.', { cause: error });
}

export function errorResponse(error: unknown): NextResponse {
  const appError = toRouteError(error);
  return NextResponse.json({ error: appError.message, code: appError.code }, { status: appError.status });
}

/**
 * Shared boundary for routes that do not need custom recovery behaviour.
 * Expected errors retain their status; unknown errors get a safe 503 response.
 */
export function withRoute<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Promise<Response>,
): (...args: TArgs) => Promise<Response> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
