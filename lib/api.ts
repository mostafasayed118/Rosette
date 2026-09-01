import { NextResponse } from 'next/server';

type RespondCase = { status: number; error: string; reason?: string };

export function respond<T extends string>(
  result: T,
  cases: Partial<Record<T, RespondCase>>,
  okBody: unknown = { ok: true },
  okStatus = 200,
): NextResponse {
  const hit = cases[result];
  if (hit) return NextResponse.json({ error: hit.error, ...(hit.reason ? { reason: hit.reason } : {}) }, { status: hit.status });
  return NextResponse.json(okBody, { status: okStatus });
}
