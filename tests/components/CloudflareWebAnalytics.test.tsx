import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CloudflareWebAnalytics } from '@/components/analytics/CloudflareWebAnalytics';

describe('CloudflareWebAnalytics', () => {
  it('renders nothing without a beacon token', () => {
    const { container } = render(<CloudflareWebAnalytics />);
    expect(container.firstChild).toBeNull();
  });

  it('injects the beacon script with the token payload', () => {
    const { container } = render(<CloudflareWebAnalytics token="beacon-123" />);
    const script = container.querySelector('script');
    expect(script).toHaveAttribute('src', 'https://static.cloudflareinsights.com/beacon.min.js');
    expect(script).toHaveAttribute('defer');
    expect(JSON.parse(script!.dataset.cfBeacon!)).toEqual({ token: 'beacon-123' });
  });
});
