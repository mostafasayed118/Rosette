import { describe, expect, it } from 'vitest';
import { addInterval, datesFrom } from '@/features/subscriptions/schedule';
describe('repositioning rules', () => {
  it('skip re-anchors chosen + later at +1 interval', () => {
    const original = datesFrom('2026-09-12', 'weekly', 4);
    const skipped = addInterval(original[1]!, 'weekly');
    expect(datesFrom(skipped, 'weekly', original.length - 1)).toEqual(['2026-09-26', '2026-10-03', '2026-10-10']);
  });
  it('resume re-spaces all remaining from the resume date', () => {
    expect(datesFrom('2026-10-01', 'monthly', 3)).toEqual(['2026-10-01', '2026-11-01', '2026-12-01']);
  });
});
