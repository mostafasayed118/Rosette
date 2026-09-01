/**
 * WCAG 2.1 contrast maths and Rosette token parsing.
 *
 * Shared by three consumers, which is the whole point:
 *   - scripts/check-contrast.mjs   (CI gate)
 *   - scripts/solve-contrast.mjs   (dev utility that proposes fixes)
 *   - tests/unit/contrast-tokens.test.ts (unit coverage)
 *
 * One definition of "passing" means CI and the test suite can never disagree.
 */

/* ---------- colour maths ---------- */

export function parseHex(h) {
  const v = String(h).replace('#', '').trim();
  if (v.length === 3) return [0, 1, 2].map((i) => parseInt(v[i] + v[i], 16));
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
}

function channel(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminance(hex) {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.1 relative-luminance contrast ratio, 1..21. */
export function contrast(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export const round = (n) => Math.round(n * 100) / 100;

/* ---------- HSL, for hue-preserving solving ---------- */

export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return [(h + 360) % 360, s, l];
}

export function hslToRgb([h, s, l]) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r, g, b;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

export const rgbToHex = (rgb) =>
  '#' + rgb.map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('');

/**
 * Walk lightness toward `direction` (-1 darken, +1 lighten) holding hue and
 * saturation, and return the first value that clears `min` on every surface.
 * Returns null if no lightness on the hue can reach it (rare but possible for
 * very saturated hues, where the fix is to desaturate rather than darken).
 */
export function solveForContrast(hex, surfaces, min, direction) {
  const [h, s, startL] = rgbToHsl(parseHex(hex));
  for (let i = 0; i <= 1000; i++) {
    const l = startL + (direction * i) / 1000;
    if (l < 0 || l > 1) break;
    const cand = rgbToHex(hslToRgb([h, s, l]));
    if (Object.values(surfaces).every((surf) => contrast(cand, surf) >= min)) return cand;
  }
  // Fall back to desaturating as well, which always converges toward grey.
  for (let i = 1; i <= 200; i++) {
    const s2 = Math.max(0, s - i / 200);
    for (let j = 0; j <= 400; j++) {
      const l = direction < 0 ? startL - j / 400 : startL + j / 400;
      if (l < 0 || l > 1) continue;
      const cand = rgbToHex(hslToRgb([h, s2, l]));
      if (Object.values(surfaces).every((surf) => contrast(cand, surf) >= min)) return cand;
    }
  }
  return null;
}

/* ---------- token parsing ---------- */

/**
 * Extract `--token: #hex;` pairs from the block containing `marker`.
 *
 * Matching on a marker rather than a selector is deliberate: app/globals.css
 * contains several `:root` and `:root.dark` blocks, and only two define the
 * palette. Anchoring on a known value is unambiguous and survives reordering.
 */
export function blockContaining(css, marker) {
  const at = css.indexOf(marker);
  if (at === -1) throw new Error(`marker not found in globals.css: ${marker}`);
  const open = css.lastIndexOf('{', at);
  const close = css.indexOf('}', at);
  const block = css.slice(open + 1, close);
  const out = {};
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) out[m[1]] = m[2];
  return out;
}

export const LIGHT_MARKER = '--color-canvas: #fdf6f0';
export const DARK_MARKER = '--color-canvas: #1a211e';

export function extractTokens(css) {
  return {
    light: blockContaining(css, LIGHT_MARKER),
    dark: blockContaining(css, DARK_MARKER),
  };
}
