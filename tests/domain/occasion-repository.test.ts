// tests/domain/occasion-repository.test.ts
import { describe, expect, it, vi } from 'vitest';
import { deleteOccasion, insertOccasion, listOccasions, upsertRecipient } from '@/features/occasions/repository';

const validInput = {
  recipientName: 'Mum',
  kind: 'birthday' as const,
  recurrence: 'annual' as const,
  month: 3,
  day: 14,
  leadDays: 7,
  locale: 'en' as const,
};

describe('listOccasions', () => {
  it('maps snake_case rows to camelCase and flattens the recipient', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({
              data: [{
                id: 'occ-1',
                recipient_id: 'rec-1',
                kind: 'birthday',
                recurrence: 'annual',
                month: 3,
                day: 14,
                event_date: null,
                lead_days: 7,
                active: true,
                recipients: { name: 'Mum', relationship: 'mother' },
              }],
              error: null,
            }),
          }),
        }),
      }),
    };
    const rows = await listOccasions(client, 'cust-1');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'occ-1', recipientName: 'Mum', relationship: 'mother', leadDays: 7, eventDate: null });
  });

  it('returns an empty array when the query errors', async () => {
    const client = {
      from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }) }),
    };
    expect(await listOccasions(client, 'cust-1')).toEqual([]);
  });
});

describe('upsertRecipient', () => {
  it('returns the existing id when the name already exists', async () => {
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'rec-existing' }, error: null }) }) }) }),
      }),
    };
    expect(await upsertRecipient(client, 'cust-1', { recipientName: 'Mum' })).toBe('rec-existing');
  });

  it('inserts and returns a new id when the name is new', async () => {
    const insert = vi.fn().mockReturnValue({ select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'rec-new' }, error: null }) }) });
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
        insert,
      }),
    };
    expect(await upsertRecipient(client, 'cust-1', { recipientName: 'Mum', relationship: 'mother' })).toBe('rec-new');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ customer_id: 'cust-1', name: 'Mum', relationship: 'mother' }));
  });

  it('returns null when the insert fails', async () => {
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
        insert: () => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }),
      }),
    };
    expect(await upsertRecipient(client, 'cust-1', { recipientName: 'Mum' })).toBeNull();
  });
});

describe('insertOccasion', () => {
  it('writes annual fields and leaves event_date null', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const client = { from: () => ({ insert }) };
    expect(await insertOccasion(client, 'cust-1', 'rec-1', validInput)).toBe('saved');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ month: 3, day: 14, event_date: null, lead_days: 7 }));
  });

  it('writes event_date and leaves month/day null for a one-off', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const client = { from: () => ({ insert }) };
    await insertOccasion(client, 'cust-1', 'rec-1', {
      recipientName: 'Youssef', kind: 'graduation', recurrence: 'once', eventDate: '2026-07-12', leadDays: 14, locale: 'en',
    });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ month: null, day: null, event_date: '2026-07-12' }));
  });

  it('reports failure when the insert errors', async () => {
    const client = { from: () => ({ insert: () => Promise.resolve({ error: { message: 'boom' } }) }) };
    expect(await insertOccasion(client, 'cust-1', 'rec-1', validInput)).toBe('failure');
  });
});

describe('deleteOccasion', () => {
  it('scopes the delete to the owning customer', async () => {
    const second = vi.fn().mockResolvedValue({ error: null });
    const first = vi.fn().mockReturnValue({ eq: second });
    const client = { from: () => ({ delete: () => ({ eq: first }) }) };
    expect(await deleteOccasion(client, 'cust-1', 'occ-1')).toBe('deleted');
    expect(first).toHaveBeenCalledWith('id', 'occ-1');
    expect(second).toHaveBeenCalledWith('customer_id', 'cust-1');
  });
});
