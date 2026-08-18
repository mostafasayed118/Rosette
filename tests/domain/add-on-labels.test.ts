import { describe, expect, it } from 'vitest';
import { addOnLabel } from '@/features/catalog/add-on-labels';

const t = (key: string) => key;

describe('addOnLabel', () => {
  it('maps note to the handwrittenNote key', () => {
    expect(addOnLabel({ id: 'note', name: 'Note' }, t)).toBe('handwrittenNote');
  });

  it('maps chocolate to the darkChocolate key', () => {
    expect(addOnLabel({ id: 'chocolate', name: 'Chocolate' }, t)).toBe('darkChocolate');
  });

  it('maps balloon to the balloon key', () => {
    expect(addOnLabel({ id: 'balloon', name: 'Balloon' }, t)).toBe('balloon');
  });

  it('falls back to the item name for unknown ids', () => {
    expect(addOnLabel({ id: 'vase', name: 'Glass vase' }, t)).toBe('Glass vase');
  });
});
