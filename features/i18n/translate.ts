import { messages } from './dictionaries';
import type { Locale } from './types';

function intlLocale(locale: Locale): string {
  return locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-FR' : 'en-US';
}

function selectPlural(locale: Locale, n: number): 'zero' | 'one' | 'two' | 'few' | 'many' | 'other' {
  return new Intl.PluralRules(intlLocale(locale)).select(n) as 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
}

function pickPlural(locale: Locale, raw: string, values: Record<string, string | number> | undefined): string | null {
  const match = /^(\w+),\s*plural,\s*([\s\S]+)$/.exec(raw);
  if (!match) return null;
  const name = match[1];
  const branchesRaw = match[2] ?? '';
  if (!name || !(name in (values ?? {}))) return null;
  const branches: Record<string, string> = {};
  let i = 0;
  while (i < branchesRaw.length) {
    while (i < branchesRaw.length && /\s/.test(branchesRaw[i] ?? '')) i += 1;
    if (i >= branchesRaw.length) break;
    let keyword = '';
    while (i < branchesRaw.length && !/\s/.test(branchesRaw[i] ?? '')) {
      keyword += branchesRaw[i];
      i += 1;
    }
    while (i < branchesRaw.length && /\s/.test(branchesRaw[i] ?? '')) i += 1;
    let body = '';
    if (branchesRaw[i] === '{') {
      let depth = 1;
      body = '';
      i += 1;
      while (i < branchesRaw.length && depth > 0) {
        const ch = branchesRaw[i] ?? '';
        if (ch === '{') depth += 1;
        else if (ch === '}') {
          depth -= 1;
          if (depth === 0) {
            i += 1;
            break;
          }
        }
        body += ch;
        i += 1;
      }
    }
    if (keyword) branches[keyword] = body;
  }
  const count = Number(values?.[name as keyof typeof values]);
  const cat = selectPlural(locale, count);
  const picked = branches[cat] ?? branches.other ?? '';
  // ICU plural branches use `#` for the current count; replace it before
  // recursively interpolating nested placeholders in the selected branch.
  return picked.replaceAll('#', String(count));
}

function findNextPlaceholder(template: string, startIndex: number): { full: string; raw: string; start: number; end: number } | null {
  let i = template.indexOf('{', startIndex);
  while (i !== -1) {
    let depth = 1;
    let j = i + 1;
    while (j < template.length && depth > 0) {
      if (template[j] === '{') depth += 1;
      else if (template[j] === '}') depth -= 1;
      j += 1;
    }
    if (depth === 0) {
      return { full: template.slice(i, j), raw: template.slice(i + 1, j - 1), start: i, end: j };
    }
    i = template.indexOf('{', j);
  }
  return null;
}

export function interpolate(locale: Locale, template: string, values?: Record<string, string | number>): string {
  if (!values) return template;
  let result = '';
  let cursor = 0;
  let placeholder = findNextPlaceholder(template, cursor);
  while (placeholder) {
    result += template.slice(cursor, placeholder.start);
    const trimmed = placeholder.raw.trim();
    let replacement: string | null = null;
    if (trimmed.includes(',')) {
      const picked = pickPlural(locale, trimmed, values);
      if (picked !== null) replacement = interpolate(locale, picked, values);
    }
    if (replacement === null && trimmed in values) replacement = String(values[trimmed]);
    if (replacement === null) replacement = placeholder.full;
    result += replacement;
    cursor = placeholder.end;
    placeholder = findNextPlaceholder(template, cursor);
  }
  result += template.slice(cursor);
  return result;
}

export type LocaleFormatter = {
  currency: (amount: number, currency?: string) => string;
  number: (n: number, opts?: Intl.NumberFormatOptions) => string;
  date: (date: Date | string | number, opts?: Intl.DateTimeFormatOptions) => string;
  relativeTime: (date: Date | string | number, base?: Date) => string;
};

// Cairo local time zone — Cloudflare Workers run in UTC, so all absolute
// date/time display must be pinned to Africa/Cairo (R-05).
const CAIRO_TZ = 'Africa/Cairo';

const DEFAULT_DATE_OPTS: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
};

// Module-level caches so we don't allocate Intl.* objects per call (R-31).
const currencyFmtCache = new Map<string, Intl.NumberFormat>();
const numberFmtCache = new Map<string, Intl.NumberFormat>();
const dateFmtCache = new Map<string, Intl.DateTimeFormat>();
const rtfFmtCache = new Map<string, Intl.RelativeTimeFormat>();

function getCurrencyFormatter(lc: string, currency: string): Intl.NumberFormat {
  const key = `${lc}:${currency}`;
  let fmt = currencyFmtCache.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(lc, { style: 'currency', currency, maximumFractionDigits: 0 });
    currencyFmtCache.set(key, fmt);
  }
  return fmt;
}

function getNumberFormatter(lc: string, opts?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${lc}:${opts ? JSON.stringify(opts) : ''}`;
  let fmt = numberFmtCache.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(lc, opts);
    numberFmtCache.set(key, fmt);
  }
  return fmt;
}

function getDateFormatter(lc: string, opts?: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const merged = { ...(opts ?? DEFAULT_DATE_OPTS), timeZone: CAIRO_TZ };
  const key = `${lc}:${JSON.stringify(merged)}`;
  let fmt = dateFmtCache.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(lc, merged);
    dateFmtCache.set(key, fmt);
  }
  return fmt;
}

function getRelativeTimeFormatter(lc: string): Intl.RelativeTimeFormat {
  let fmt = rtfFmtCache.get(lc);
  if (!fmt) {
    fmt = new Intl.RelativeTimeFormat(lc, { numeric: 'auto' });
    rtfFmtCache.set(lc, fmt);
  }
  return fmt;
}

export function createFormatter(locale: Locale): LocaleFormatter {
  const lc = intlLocale(locale);
  return {
    currency(amount, currency = 'EGP') {
      return getCurrencyFormatter(lc, currency).format(amount);
    },
    number(n, opts) {
      return getNumberFormatter(lc, opts).format(n);
    },
    date(date, opts) {
      const d = date instanceof Date ? date : new Date(date);
      return getDateFormatter(lc, opts).format(d);
    },
    relativeTime(date, base = new Date()) {
      const d = date instanceof Date ? date : new Date(date);
      const diffMs = d.getTime() - base.getTime();
      const diffDays = Math.round(diffMs / 86_400_000);
      const rtf = getRelativeTimeFormatter(lc);
      if (Math.abs(diffDays) < 1) {
        const diffHours = Math.round(diffMs / 3_600_000);
        if (Math.abs(diffHours) < 1) return rtf.format(Math.round(diffMs / 60_000), 'minute');
        return rtf.format(diffHours, 'hour');
      }
      if (Math.abs(diffDays) < 30) return rtf.format(diffDays, 'day');
      return rtf.format(Math.round(diffDays / 30), 'month');
    },
  };
}

export function translate(locale: Locale, key: string, values?: Record<string, string | number>): string {
  const template = messages[locale][key] ?? messages.en[key] ?? key;
  return interpolate(locale, template, values);
}