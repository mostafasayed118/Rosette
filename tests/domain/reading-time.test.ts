import { describe, expect, it } from 'vitest';
import { estimateReadingTime } from '@/features/blog/reading-time';

describe('estimateReadingTime', () => {
  it('counts words from HTML content at 200 wpm, rounded up', () => {
    const html = '<p>' + Array.from({ length: 400 }, () => 'word').join(' ') + '</p>';
    expect(estimateReadingTime(html)).toBe(2);
  });

  it('strips tags and collapses whitespace', () => {
    expect(estimateReadingTime('<p>Hello <strong>world</strong></p>', 200)).toBe(1);
  });

  it('returns at least 1 minute', () => {
    expect(estimateReadingTime('<p>Hi</p>')).toBe(1);
  });

  it('returns 1 for empty or tag-only content', () => {
    expect(estimateReadingTime('')).toBe(1);
    expect(estimateReadingTime('<p></p><ul></ul>')).toBe(1);
  });
});
