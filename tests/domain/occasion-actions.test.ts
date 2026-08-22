import { describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ getAdminSupabase: () => ({ from: () => ({}) }) }));
vi.mock('@/features/auth/customer', () => ({ getCurrentCustomer: vi.fn().mockResolvedValue(null) }));

const { removeOccasion, saveOccasion } = await import('@/features/occasions/actions');

const customer = { id: 'cust-1', email: 'nour@example.com', displayName: 'Nour', phone: '' };
const valid = { recipientName: 'Mum', kind: 'birthday', recurrence: 'annual', month: 3, day: 14, leadDays: 7, locale: 'en' };

describe('saveOccasion', () => {
  it('refuses an anonymous caller before touching the database', async () => {
    const client = { from: vi.fn() };
    expect(await saveOccasion({ ...valid, customer: null, client } as never)).toBe('unauthenticated');
    expect(client.from).not.toHaveBeenCalled();
  });

  it('rejects invalid input', async () => {
    const client = { from: vi.fn() };
    expect(await saveOccasion({ ...valid, month: 13, customer, client } as never)).toBe('invalid');
    expect(client.from).not.toHaveBeenCalled();
  });

  it('creates the recipient then the occasion', async () => {
    const insertOccasion = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: (table: string) => {
        if (table === 'recipients') {
          return {
            select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'rec-1' }, error: null }) }) }) }),
          };
        }
        return { insert: insertOccasion };
      },
    };
    expect(await saveOccasion({ ...valid, customer, client } as never)).toBe('saved');
    expect(insertOccasion).toHaveBeenCalledWith(expect.objectContaining({ customer_id: 'cust-1', recipient_id: 'rec-1' }));
  });

  it('fails when the recipient cannot be resolved', async () => {
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
        insert: () => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }),
      }),
    };
    expect(await saveOccasion({ ...valid, customer, client } as never)).toBe('failure');
  });
});

describe('removeOccasion', () => {
  it('refuses an anonymous caller', async () => {
    const client = { from: vi.fn() };
    expect(await removeOccasion('occ-1', undefined, { customer: null, client } as never)).toBe('unauthenticated');
    expect(client.from).not.toHaveBeenCalled();
  });

  it('deletes scoped to the customer', async () => {
    const second = vi.fn().mockResolvedValue({ error: null });
    const client = { from: () => ({ delete: () => ({ eq: () => ({ eq: second }) }) }) };
    expect(await removeOccasion('occ-1', undefined, { customer, client } as never)).toBe('deleted');
    expect(second).toHaveBeenCalledWith('customer_id', 'cust-1');
  });
});
