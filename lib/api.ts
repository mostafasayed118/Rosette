import { NextResponse } from 'next/server';

export function logRouteError(scope: string, error: unknown): void {
  console.error(`${scope} error`, error instanceof Error ? error.message : 'unknown');
}

export function respond<T extends string>(
  result: T,
  cases: Partial<Record<T, { status: number; error: string }>>,
  okBody: unknown = { ok: true },
  okStatus = 200,
): NextResponse {
  const hit = cases[result];
  if (hit) return NextResponse.json({ error: hit.error }, { status: hit.status });
  return NextResponse.json(okBody, { status: okStatus });
}
