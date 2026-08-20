import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPreferenceToken } from '@/features/email-preferences/preferences-service';
import { GET, POST } from '@/app/api/email-preferences/unsubscribe/route';

const { setPreference } = vi.hoisted(() => ({ setPreference: vi.fn() }));

vi.mock('@/lib/server-env', () => ({
  getRequiredServerEnv: vi.fn(() => 'test-secret'),
}));
vi.mock('@/lib/supabase/admin', () => ({
  getAdminSupabase: vi.fn(() => ({})),
}));
vi.mock('@/features/email-preferences/preferences-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/email-preferences/preferences-service')>();
  return { ...actual, setEngagementPreference: setPreference };
});

function url(email = 'buyer@example.com', token = createPreferenceToken(email, 'test-secret'), locale = 'en') {
  return `http://localhost/api/email-preferences/unsubscribe?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}&locale=${locale}`;
}

describe('email preference unsubscribe route', () => {
  beforeEach(() => {
    setPreference.mockReset().mockResolvedValue('saved');
  });

  it('accepts a valid GET and disables engagement email', async () => {
    const response = await GET(new Request(url()));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('unsubscribed');
    expect(setPreference).toHaveBeenCalledWith({}, 'buyer@example.com', false);
  });

  it('accepts a valid POST for one-click unsubscribe', async () => {
    const response = await POST(new Request(url('buyer@example.com'), { method: 'POST' }));
    expect(response.status).toBe(200);
    expect(setPreference).toHaveBeenCalledWith({}, 'buyer@example.com', false);
  });

  it('rejects missing credentials without disclosing preference state', async () => {
    const response = await GET(new Request('http://localhost/api/email-preferences/unsubscribe'));
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain('buyer@example.com');
    expect(setPreference).not.toHaveBeenCalled();
  });

  it('rejects a tampered token', async () => {
    const response = await GET(new Request(url('buyer@example.com', 'tampered')));
    expect(response.status).toBe(400);
    expect(setPreference).not.toHaveBeenCalled();
  });

  it('keeps invalid locale from changing authorization or crashing', async () => {
    const response = await GET(new Request(url('buyer@example.com', undefined, 'xx')));
    expect(response.status).toBe(200);
    expect(setPreference).toHaveBeenCalledOnce();
  });
});
