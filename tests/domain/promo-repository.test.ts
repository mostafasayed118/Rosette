import { describe, expect, it } from 'vitest';
import { fetchPromo } from '@/features/promo/repository';

type Call = { table: string; column: string; value: string };

function fakeClient(seed: { promo?: Record<string, unknown> | null; error?: boolean }) {
  const calls: Call[] = [];
  const from = (table: string) => ({
    select: () => ({
      eq: (column: string, value: string) => {
        calls.push({ table, column, value });
        return { maybeSingle: async () => (seed.error ? { data: null, error: { message: 'db down' } } : { data: seed.promo ?? null, error: null }) };
      },
    }),
  });
  return { client: { from }, calls };
}

describe('fetchPromo', () => {
  it('looks up by uppercase code and returns the row', async () => {
    const { client, calls } = fakeClient({ promo: { code: 'ROSE10', type: 'percent', percent_off: 10 } });
    const result = await fetchPromo(client, '  rose10 ');
    expect(calls).toEqual([{ table: 'promo_codes', column: 'code', value: 'ROSE10' }]);
    expect(result).toMatchObject({ code: 'ROSE10', type: 'percent', percent_off: 10 });
  });
  it('returns null when missing or on error', async () => {
    expect(await fetchPromo(fakeClient({ promo: null }).client, 'ROSE10')).toBeNull();
    expect(await fetchPromo(fakeClient({ promo: { code: 'X' }, error: true }).client, 'ROSE10')).toBeNull();
  });
});
