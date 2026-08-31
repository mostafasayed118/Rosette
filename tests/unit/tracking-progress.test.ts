import { describe, expect, it } from 'vitest';
import { formatStepTime } from '@/features/tracking/progress-format';

describe('tracking progress formatting', () => {
  it('uses a readable pending label instead of placeholder time', () => {
    expect(formatStepTime(undefined, 'en', 'Pending update')).toBe('Pending update');
  });

  it('formats a recorded time using the active locale', () => {
    expect(formatStepTime('2026-08-30T12:30:00.000Z', 'en', 'Pending update')).toContain('30');
  });
});
