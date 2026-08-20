import { describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/admin/gift-cards/route';

vi.mock('@/features/auth/server', () => ({ getCurrentAdmin: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ getAdminSupabase: vi.fn(() => ({ from: () => ({}) })) }));

import { getCurrentAdmin } from '@/features/auth/server';

describe('admin gift-card route', () => {
  it('requires an admin identity', async () => {
    vi.mocked(getCurrentAdmin).mockResolvedValue(null);
    const response = await POST(new Request('https://shop.example.com/api/admin/gift-cards', { method: 'POST', body: JSON.stringify({ action: 'issue' }) }));
    expect(response.status).toBe(403);
  });
});
