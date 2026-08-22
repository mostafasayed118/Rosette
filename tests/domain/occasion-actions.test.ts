import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  adminFrom: vi.fn(),
  getCurrentCustomer: vi.fn().mockResolvedValue(null),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/lib/supabase/admin', () => ({ getAdminSupabase: () => ({ from: mocks.adminFrom }) }));
vi.mock('@/features/auth/customer', () => ({ getCurrentCustomer: mocks.getCurrentCustomer }));

const { editOccasion, removeOccasion, saveOccasion } = await import('@/features/occasions/actions');
const { editOccasionFor, removeOccasionFor, saveOccasionFor } = await import('@/features/occasions/action-internals');

const customer = { id: 'cust-1', email: 'nour@example.com', displayName: 'Nour', phone: '' };
const valid = { recipientName: 'Mum', kind: 'birthday', recurrence: 'annual', month: 3, day: 14, leadDays: 7, locale: 'en' };

describe('occasion server actions (remote entry points)', () => {
  it('saveOccasion refuses an anonymous caller before touching the database', async () => {
    expect(await saveOccasion({ ...valid } as never)).toBe('unauthenticated');
    expect(mocks.adminFrom).not.toHaveBeenCalled();
  });

  it('editOccasion refuses an anonymous caller before touching the database', async () => {
    expect(await editOccasion('occ-1', { ...valid } as never)).toBe('unauthenticated');
    expect(mocks.adminFrom).not.toHaveBeenCalled();
  });

  it('removeOccasion refuses an anonymous caller before touching the database', async () => {
    expect(await removeOccasion('occ-1')).toBe('unauthenticated');
    expect(mocks.adminFrom).not.toHaveBeenCalled();
  });

  it('ignores an injected customer in the payload — identity comes from the session only', async () => {
    expect(await saveOccasion({ ...valid, customer, client: { from: mocks.adminFrom } } as never)).toBe('unauthenticated');
    expect(mocks.adminFrom).not.toHaveBeenCalled();
  });
});

describe('saveOccasionFor', () => {
  it('rejects invalid input', async () => {
    const client = { from: vi.fn() };
    expect(await saveOccasionFor(customer, client as never, { ...valid, month: 13 })).toBe('invalid');
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
    expect(await saveOccasionFor(customer, client as never, valid)).toBe('saved');
    expect(insertOccasion).toHaveBeenCalledWith(expect.objectContaining({ customer_id: 'cust-1', recipient_id: 'rec-1' }));
  });

  it('fails when the recipient cannot be resolved', async () => {
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
        insert: () => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }),
      }),
    };
    expect(await saveOccasionFor(customer, client as never, valid)).toBe('failure');
  });
});

describe('editOccasionFor', () => {
  it('updates scoped to the customer', async () => {
    const second = vi.fn().mockResolvedValue({ error: null });
    const first = vi.fn().mockReturnValue({ eq: second });
    const update = vi.fn().mockReturnValue({ eq: first });
    const client = {
      from: (table: string) => {
        if (table === 'recipients') {
          return {
            select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'rec-1' }, error: null }) }) }) }),
          };
        }
        return { update };
      },
    };
    expect(await editOccasionFor(customer, client as never, 'occ-1', valid)).toBe('saved');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ recurrence: 'annual', month: 3, day: 14 }));
    expect(first).toHaveBeenCalledWith('id', 'occ-1');
    expect(second).toHaveBeenCalledWith('customer_id', 'cust-1');
  });

  it('rejects invalid input', async () => {
    const client = { from: vi.fn() };
    expect(await editOccasionFor(customer, client as never, 'occ-1', { ...valid, recurrence: 'once', month: 3 })).toBe('invalid');
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe('removeOccasionFor', () => {
  it('deletes scoped to the customer', async () => {
    const second = vi.fn().mockResolvedValue({ error: null });
    const client = { from: () => ({ delete: () => ({ eq: () => ({ eq: second }) }) }) };
    expect(await removeOccasionFor(customer, client as never, 'occ-1')).toBe('deleted');
    expect(second).toHaveBeenCalledWith('customer_id', 'cust-1');
  });
});
