import { describe, expect, it } from 'vitest';
import { selectDataSource } from '@/features/commerce/provider-selection';

describe('data source selection', () => {
  it('uses local mode without Supabase configuration', () => {
    expect(selectDataSource({ url: undefined, key: undefined })).toBe('local');
  });

  it('uses Supabase only when both public values exist', () => {
    expect(selectDataSource({ url: 'https://example.supabase.co', key: 'anon' })).toBe('supabase');
  });
});
