import { timingSafeEqual } from 'node:crypto';
import { getOptionalServerEnv, getRequiredServerEnv } from '@/lib/server-env';

export function isCronAuthorized(authorization: string | null, secret: string): boolean {
  const token = (authorization ?? '').startsWith('Bearer ') ? authorization!.slice('Bearer '.length) : '';
  const provided = Buffer.from(token);
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

/**
 * Per-job secret: if `CRON_SECRET_<JOB>` is set (e.g. CRON_SECRET_NOTIFICATIONS)
 * that value is authoritative for the job; otherwise the shared `CRON_SECRET`
 * is the fallback. This lets operators rotate to per-job secrets without a
 * flag day — unset per-job vars keep the current behaviour.
 */
export function isCronAuthorizedForJob(authorization: string | null, job: string): boolean {
  const perJobKey = `CRON_SECRET_${job.toUpperCase()}` as never;
  const perJob =
    (process.env[perJobKey as keyof NodeJS.ProcessEnv] as string | undefined) ??
    getOptionalServerEnv(perJobKey);
  let fallback: string | undefined =
    (process.env.CRON_SECRET as string | undefined) ?? getOptionalServerEnv('CRON_SECRET');
  if (!fallback) {
    try {
      fallback = getRequiredServerEnv('CRON_SECRET');
    } catch {
      // No fallback configured — let the empty-candidates path return false.
    }
  }
  const candidates = [perJob, fallback].filter((value): value is string => typeof value === 'string' && value.length > 0);
  if (candidates.length === 0) return false;
  const token = (authorization ?? '').startsWith('Bearer ') ? authorization!.slice('Bearer '.length) : '';
  const provided = Buffer.from(token);
  return candidates.some((secret) => {
    const expected = Buffer.from(secret);
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  });
}
