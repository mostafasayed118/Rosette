import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime } from '@/lib/date';

describe('date helpers', () => {
  it('returns a string for valid input', () => {
    expect(typeof formatDateTime('2024-01-15T10:30:00Z', 'en')).toBe('string');
  });

  it('returns Invalid Date for invalid input', () => {
    expect(formatDateTime('not-a-date', 'en')).toBe('Invalid Date');
  });

  it('formats date only', () => {
    expect(typeof formatDate('2024-01-15T10:30:00Z', 'en')).toBe('string');
  });
});
