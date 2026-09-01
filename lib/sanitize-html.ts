/**
 * Output encoding for `dangerouslySetInnerHTML`.
 *
 * Every `dangerouslySetInnerHTML` in this app is a raw-HTML injection point, so
 * both helpers below live together:
 *  - `sanitizeHtml`    — CMS/blog rich text authored in the admin and stored in the DB.
 *  - `serializeJsonLd` — inline `<script type="application/ld+json">` payloads.
 *
 * Dependency-free and DOM-free on purpose: this runs inside the Cloudflare
 * Worker built by OpenNext, where `jsdom`/`dompurify` cannot run and would blow
 * the Worker size limit.
 */

/* -------------------------------------------------------------------------- */
/* HTML sanitizer                                                             */
/* -------------------------------------------------------------------------- */

/** Tags kept as-is (attributes are filtered separately). */
const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr', 'span', 'div',
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'mark', 'small', 'sub', 'sup', 'abbr', 'q', 'cite', 'time',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote', 'pre', 'code', 'figure', 'figcaption',
  'a', 'img',
  'table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'wbr',
]);

/** Tags that never carry a closing tag of their own. */
const VOID_TAGS = new Set(['br', 'hr', 'img', 'wbr', 'col']);

/** Tags whose *content* is dropped along with the tag itself. */
const DROP_CONTENT_TAGS = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template', 'noscript',
  'link', 'meta', 'base', 'frame', 'frameset', 'noframes',
  'form', 'input', 'button', 'select', 'option', 'textarea',
  'canvas', 'audio', 'video', 'source', 'track', 'map', 'area', 'portal',
]);

/** Attributes allowed on every tag. `style` and `id` are intentionally excluded. */
const GLOBAL_ATTRIBUTES = new Set(['class', 'title', 'lang', 'dir']);

const TAG_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel']),
  img: new Set(['src', 'alt', 'width', 'height', 'loading']),
  td: new Set(['colspan', 'rowspan', 'scope']),
  th: new Set(['colspan', 'rowspan', 'scope']),
  ol: new Set(['start', 'type']),
  col: new Set(['span']),
  time: new Set(['datetime']),
};

/** Attributes whose value is a URL and therefore has to be scheme-checked. */
const URL_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(['href']),
  img: new Set(['src']),
};

const SAFE_URL_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);

/** Only these named entities are decoded inside URL values; anything else is rejected. */
const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const CONTROL_CHARACTERS_RE = /[\u0000-\u001F\u007F-\u009F]/;
const URL_SCHEME_RE = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;
const RELATIVE_URL_RE = /^[\w.-]+(?:[/#?].*)?$/;
const OPEN_TAG_RE = /<([a-zA-Z][a-zA-Z0-9:.-]*)((?:\s+[^\s/>=<"']+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*))?)*)\s*(\/?)>/y;
const CLOSE_TAG_RE = /<\/([a-zA-Z][a-zA-Z0-9:.-]*)\s*>/y;
const ATTRIBUTE_RE = /\s*([^\s/>=<"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/gy;
const ENTITY_RE = /^#(?:[0-9]{1,7}|[xX][0-9a-fA-F]{1,6});|^[a-zA-Z][a-zA-Z0-9]{1,31};/;

type TagToken =
  | { kind: 'skip'; end: number }
  | { kind: 'close'; name: string; end: number }
  | { kind: 'open'; name: string; rawAttributes: string; selfClosing: boolean; end: number };

/**
 * Strip everything that can execute script or escape the element: `script`,
 * `style`, `iframe`, `object`, `embed`, `svg`, comments/CDATA, `on*` handlers,
 * `style` attributes, and any `javascript:`/`data:` (or otherwise unsafe) URL.
 * Unknown-but-harmless tags are unwrapped so their text survives.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';
  const open: string[] = [];
  let out = '';
  let i = 0;

  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);

    const tag = readTag(html, lt);
    if (!tag) {
      // Not a tag at all — a literal "<" must never reach the browser unescaped.
      out += '&lt;';
      i = lt + 1;
      continue;
    }
    i = tag.end;

    if (tag.kind === 'skip') continue;

    if (tag.kind === 'close') {
      const at = open.lastIndexOf(tag.name);
      if (at === -1) continue; // unmatched closer: dropping it keeps the output balanced
      for (let k = open.length - 1; k >= at; k--) {
        const name = open.pop();
        if (name) out += `</${name}>`;
      }
      continue;
    }

    if (DROP_CONTENT_TAGS.has(tag.name)) {
      const after = findClosingTag(html, i, tag.name);
      i = after === -1 ? html.length : after;
      continue;
    }

    if (!ALLOWED_TAGS.has(tag.name)) continue; // unwrap: keep the children

    const attributes = serializeAttributes(tag.name, tag.rawAttributes);
    out += attributes ? `<${tag.name} ${attributes}>` : `<${tag.name}>`;
    if (!tag.selfClosing && !VOID_TAGS.has(tag.name)) open.push(tag.name);
  }

  while (open.length > 0) {
    const name = open.pop();
    if (name) out += `</${name}>`;
  }
  return out;
}

function readTag(html: string, start: number): TagToken | null {
  if (html.startsWith('<!--', start)) return { kind: 'skip', end: endOf(html, '-->', start + 4, 3) };
  if (html.startsWith('<![CDATA[', start)) return { kind: 'skip', end: endOf(html, ']]>', start + 9, 3) };
  if (html.startsWith('<!', start)) return { kind: 'skip', end: endOf(html, '>', start + 2, 1) };

  CLOSE_TAG_RE.lastIndex = start;
  const closing = CLOSE_TAG_RE.exec(html);
  if (closing) return { kind: 'close', name: (closing[1] ?? '').toLowerCase(), end: start + closing[0].length };

  OPEN_TAG_RE.lastIndex = start;
  const opening = OPEN_TAG_RE.exec(html);
  if (opening) {
    return {
      kind: 'open',
      name: (opening[1] ?? '').toLowerCase(),
      rawAttributes: opening[2] ?? '',
      selfClosing: opening[3] === '/',
      end: start + opening[0].length,
    };
  }
  return null;
}

function endOf(html: string, marker: string, from: number, markerLength: number): number {
  const at = html.indexOf(marker, from);
  return at === -1 ? html.length : at + markerLength;
}

/** Index just past `</name>` (case-insensitive), or -1 when the tag is never closed. */
function findClosingTag(html: string, from: number, name: string): number {
  const lower = html.toLowerCase();
  const needle = `</${name}`;
  let at = from;
  for (;;) {
    const idx = lower.indexOf(needle, at);
    if (idx === -1) return -1;
    let j = idx + needle.length;
    while (j < html.length && /\s/.test(html[j] ?? '')) j++;
    if (html[j] === '>') return j + 1;
    at = idx + 1;
  }
}

function serializeAttributes(tagName: string, raw: string): string {
  const tagSpecific = TAG_ATTRIBUTES[tagName];
  const urls = URL_ATTRIBUTES[tagName];
  const seen = new Set<string>();
  const parts: string[] = [];

  ATTRIBUTE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTRIBUTE_RE.exec(raw)) !== null) {
    const name = (match[1] ?? '').toLowerCase();
    if (!name || seen.has(name)) continue;
    if (name.startsWith('on')) continue; // every on* event handler
    if (!GLOBAL_ATTRIBUTES.has(name) && !tagSpecific?.has(name)) continue;

    const value = match[2] ?? match[3] ?? match[4] ?? '';
    if (urls?.has(name)) {
      // Decode first: browsers resolve entities before reading the URL, so
      // `java&#115;cript:` is a javascript: URL even though it does not look like one.
      const decoded = decodeUrlValue(value);
      if (decoded === null || !isSafeUrl(decoded)) continue;
      parts.push(`${name}="${escapeUrlAttribute(decoded)}"`);
    } else {
      parts.push(`${name}="${escapeAttributeValue(value)}"`);
    }
    seen.add(name);
  }
  return parts.join(' ');
}

function isSafeUrl(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') return true;
  // Control characters let "java\tscript:" slip past naive scheme checks; browsers drop them anyway.
  if (CONTROL_CHARACTERS_RE.test(trimmed)) return false;
  const scheme = URL_SCHEME_RE.exec(trimmed);
  if (scheme?.[1]) return SAFE_URL_SCHEMES.has(scheme[1].toLowerCase());
  // Schemeless: root-relative, fragment, query or bare relative path.
  return /^[/#?]/.test(trimmed) || RELATIVE_URL_RE.test(trimmed);
}

function decodeUrlValue(value: string): string | null {
  let out = '';
  let i = 0;
  while (i < value.length) {
    const amp = value.indexOf('&', i);
    if (amp === -1) {
      out += value.slice(i);
      break;
    }
    out += value.slice(i, amp);
    const reference = ENTITY_RE.exec(value.slice(amp + 1));
    if (!reference) {
      out += '&'; // bare ampersand: browsers keep it literal
      i = amp + 1;
      continue;
    }
    const decoded = decodeEntity(reference[0].slice(0, -1));
    if (decoded === null) return null; // entity we cannot resolve: reject rather than guess
    out += decoded;
    i = amp + 1 + reference[0].length;
  }
  return out;
}

function decodeEntity(reference: string): string | null {
  if (reference.startsWith('#')) {
    const hex = reference[1] === 'x' || reference[1] === 'X';
    const digits = hex ? reference.slice(2) : reference.slice(1);
    if (!digits) return null;
    const code = Number.parseInt(digits, hex ? 16 : 10);
    if (!Number.isFinite(code) || code === 0 || code > 0x10ffff) return null;
    return String.fromCodePoint(code);
  }
  return NAMED_ENTITIES[reference.toLowerCase()] ?? null;
}

function escapeAttributeValue(value: string): string {
  return value.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeUrlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* -------------------------------------------------------------------------- */
/* JSON-LD serialization                                                      */
/* -------------------------------------------------------------------------- */

const JSON_LD_ESCAPE_RE = /[<>&\u2028\u2029]/g;
const JSON_LD_ESCAPES: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

/**
 * Serialize data for `<script type="application/ld+json">`.
 *
 * `JSON.stringify` leaves `<` and `>` untouched, so a value containing
 * `</script>` closes the element early and the rest is parsed as markup.
 * Escaping to `\u003c`/`\u003e` (rather than `&lt;`) keeps the payload valid
 * JSON that parses back to the original string; none of `<`, `>`, `&`, U+2028
 * or U+2029 are JSON syntax characters, so the structure is never corrupted.
 */
export function serializeJsonLd(data: unknown): string {
  const json = JSON.stringify(data) ?? 'null';
  return json.replace(JSON_LD_ESCAPE_RE, (char) => JSON_LD_ESCAPES[char] ?? char);
}
