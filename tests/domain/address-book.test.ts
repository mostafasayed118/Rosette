import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import {
  removeAddressFor,
  saveAddressFor,
} from '@/features/account/addresses/action-internals';
import {
  listAddresses,
} from '@/features/account/addresses/repository';
import {
  validateAddressBookInput,
  type AddressBookEntry,
  type AddressBookInput,
} from '@/features/account/addresses/types';

const CUSTOMER = { id: 'u1' };

function makeEntry(overrides: Partial<AddressBookEntry> = {}): AddressBookEntry {
  return {
    id: 'a1',
    label: 'Home',
    recipientName: 'Mom',
    recipientPhone: '+201000000000',
    address: '12 Zamalek St',
    citySlug: 'cairo',
    isDefault: false,
    ...overrides,
  };
}

function validInput(): AddressBookInput {
  return {
    label: 'Home',
    recipientName: 'Mom',
    recipientPhone: '+201000000000',
    address: '12 Zamalek St',
    citySlug: 'cairo',
  };
}

function makeClient(overrides: Record<string, unknown> = {}) {
  const rows: AddressBookEntry[] = [];
  const calls: { op: string; table: string; row?: unknown; id?: string; eq?: unknown }[] = [];
  const client = {
    from: (table: string) => {
      const chainable = (terminal: unknown) => {
        const chain: Record<string, unknown> = {
          eq: () => chain,
          neq: () => chain,
          order: () => chain,
          then: (res: (v: unknown) => void) => res(terminal),
        };
        return chain;
      };
      return {
        select: () =>
          chainable({
            data: rows.map((r) => ({
              id: r.id,
              label: r.label,
              recipient_name: r.recipientName,
              recipient_phone: r.recipientPhone,
              address: r.address,
              city_slug: r.citySlug,
              is_default: r.isDefault,
            })),
            error: null,
          }),
        insert: (row: unknown) => {
          calls.push({ op: 'insert', table, row });
          return chainable({ error: overrides.insertError ?? null });
        },
        update: () => chainable({ error: null }),
        delete: () => {
          const delChain: Record<string, unknown> = {
            eq: (field: string, value: string) => {
              if (field === 'id') calls.push({ op: 'delete', table, id: value });
              return delChain;
            },
            neq: () => delChain,
            then: (res: (v: unknown) => void) => res({ error: overrides.deleteError ?? null }),
          };
          return delChain;
        },
      };
    },
  };
  return { client, rows, calls };
}

describe('address-book validation', () => {
  it('accepts a complete valid input', () => {
    expect(validateAddressBookInput(validInput())).toBeNull();
  });

  it('rejects blank or oversized label, name, phone, address, and city', () => {
    expect(validateAddressBookInput({ ...validInput(), label: '  ' })).toBe('invalid');
    expect(validateAddressBookInput({ ...validInput(), label: 'x'.repeat(51) })).toBe('invalid');
    expect(validateAddressBookInput({ ...validInput(), recipientName: '' })).toBe('invalid');
    expect(validateAddressBookInput({ ...validInput(), recipientName: 'x'.repeat(81) })).toBe('invalid');
    expect(validateAddressBookInput({ ...validInput(), recipientPhone: '' })).toBe('invalid');
    expect(validateAddressBookInput({ ...validInput(), recipientPhone: 'x'.repeat(51) })).toBe('invalid');
    expect(validateAddressBookInput({ ...validInput(), address: '' })).toBe('invalid');
    expect(validateAddressBookInput({ ...validInput(), address: 'x'.repeat(301) })).toBe('invalid');
    expect(validateAddressBookInput({ ...validInput(), citySlug: ' ' })).toBe('invalid');
  });

  it('accepts isDefault flag on input', () => {
    expect(validateAddressBookInput({ ...validInput(), isDefault: true })).toBeNull();
  });
});

describe('address-book repository', () => {
  it('maps snake_case rows to AddressBookEntry shape', async () => {
    const { client } = makeClient();
    // listAddresses is exercised through action-internals; repository mapping
    // verified via rowToEntry through listAddressesFor in internals tests.
    // Direct check: mock client returns snake_case row.
    const rows = [
      {
        id: '9',
        label: 'Office',
        recipient_name: 'Ali',
        recipient_phone: '+20212345678',
        address: '9 Nile Tower',
        city_slug: 'greater-cairo',
        is_default: true,
      },
    ];
    const mockClient = {
      from: () => {
        const chain: Record<string, unknown> = {
          eq: () => chain,
          order: () => chain,
          then: (res: (v: unknown) => void) => res({ data: rows, error: null }),
        };
        return {
          select: () => chain,
        };
      },
    };
    const result = await listAddresses(mockClient, 'u1');
    expect(result).toEqual([
      {
        id: '9',
        label: 'Office',
        recipientName: 'Ali',
        recipientPhone: '+20212345678',
        address: '9 Nile Tower',
        citySlug: 'greater-cairo',
        isDefault: true,
      },
    ]);
  });
});

describe('address-book internals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saveAddressFor inserts a new address and returns saved', async () => {
    const { client, calls } = makeClient();
    const result = await saveAddressFor(CUSTOMER, client, null, validInput(), '/en/cairo');
    expect(result).toBe('saved');
    const insert = calls.find((c) => c.op === 'insert');
    expect(insert).toBeDefined();
    expect(insert?.row).toMatchObject({ customer_id: 'u1', label: 'Home', city_slug: 'cairo' });
  });

  it('saveAddressFor returns invalid without touching the database', async () => {
    const { client, calls } = makeClient();
    const result = await saveAddressFor(CUSTOMER, client, null, { ...validInput(), label: '' }, '/en/cairo');
    expect(result).toBe('invalid');
    expect(calls.find((c) => c.op === 'insert')).toBeUndefined();
  });

  it('saveAddressFor returns failure when insert errors', async () => {
    const { client } = makeClient({ insertError: { message: 'db down' } });
    const result = await saveAddressFor(CUSTOMER, client, null, validInput(), '/en/cairo');
    expect(result).toBe('failure');
  });

  it('removeAddressFor deletes and returns deleted', async () => {
    const { client, calls } = makeClient();
    const result = await removeAddressFor(CUSTOMER, client, 'a1', '/en/cairo');
    expect(result).toBe('deleted');
    expect(calls.find((c) => c.op === 'delete')?.id).toBe('a1');
  });

  it('removeAddressFor returns failure when delete errors', async () => {
    const { client } = makeClient({ deleteError: { message: 'db down' } });
    const result = await removeAddressFor(CUSTOMER, client, 'a1');
    expect(result).toBe('failure');
  });
});
