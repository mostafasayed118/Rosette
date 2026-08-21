/**
 * Structured, dependency-free logger.
 *
 * Emits one line of JSON per event via `console.*`, which is what Cloudflare
 * Workers Logs (and `wrangler tail`) ingest. No Node-only APIs, so it is safe
 * in the Workers runtime and adds nothing to the bundle-size budget.
 */

type Level = 'info' | 'warn' | 'error';
type Fields = Record<string, unknown>;

const SECRET_KEY_PATTERN = /key|secret|token|password|hmac|authorization/i;
const MAX_STRING_LENGTH = 500;
const REDACTED = '[redacted]';
const RESERVED_FIELDS = new Set(['level', 'event', 'ts']);

function isProduction(): boolean {
  // Avoid importing server-env here: the logger must stay usable from any runtime.
  return process.env.NODE_ENV === 'production' || Boolean(process.env.DEPLOYMENT_RUNTIME);
}

function serializeError(value: unknown): Fields {
  if (value instanceof Error) {
    const serialized: Fields = { name: value.name, message: value.message };
    if (!isProduction() && value.stack) serialized.stack = value.stack;
    return serialized;
  }
  return { message: typeof value === 'string' ? value : String(value) };
}

function sanitize(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…[truncated]` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol' || value === undefined) return undefined;

  if (Array.isArray(value)) {
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    return value.map((entry) => sanitize(entry, seen));
  }

  if (typeof value === 'object') {
    const source = value as object;
    if (seen.has(source)) return '[circular]';
    seen.add(source);
    const result: Fields = {};
    for (const [key, nested] of Object.entries(source)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        result[key] = REDACTED;
        continue;
      }
      const cleaned = sanitize(nested, seen);
      if (cleaned !== undefined) result[key] = cleaned;
    }
    return result;
  }

  return undefined;
}

function emit(level: Level, event: string, fields: Fields | undefined, context: Fields): void {
  const payload: Fields = { level, event, ts: new Date().toISOString(), ...context };
  const seen = new WeakSet<object>();

  for (const [key, value] of Object.entries(fields ?? {})) {
    if (RESERVED_FIELDS.has(key)) continue;
    if (key === 'error') {
      payload.error = sanitize(serializeError(value), seen);
      continue;
    }
    if (SECRET_KEY_PATTERN.test(key)) {
      payload[key] = REDACTED;
      continue;
    }
    const cleaned = sanitize(value, seen);
    if (cleaned !== undefined) payload[key] = cleaned;
  }

  let line: string;
  try {
    line = JSON.stringify(payload);
  } catch {
    line = JSON.stringify({ level, event, ts: payload.ts, logSerializationFailed: true });
  }

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export type Logger = {
  info: (event: string, fields?: Fields) => void;
  warn: (event: string, fields?: Fields) => void;
  error: (event: string, fields?: Fields) => void;
};

function createLogger(context: Fields = {}): Logger {
  return {
    info: (event, fields) => emit('info', event, fields, context),
    warn: (event, fields) => emit('warn', event, fields, context),
    error: (event, fields) => emit('error', event, fields, context),
  };
}

export const logger: Logger = createLogger();

/** Scope every emission to a request so log lines can be correlated. */
export function withRequestContext(requestId: string): Logger {
  return createLogger({ requestId });
}
