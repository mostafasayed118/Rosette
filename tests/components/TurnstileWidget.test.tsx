import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TurnstileWidget } from '@/components/security/TurnstileWidget';

afterEach(() => {
  delete window.turnstile;
  document.head.querySelectorAll('script[src*="challenges.cloudflare.com"]').forEach((node) => node.remove());
});

describe('TurnstileWidget', () => {
  it('renders nothing without a site key', () => {
    const { container } = render(<TurnstileWidget siteKey="" onVerify={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a placeholder container when a site key is set', () => {
    render(<TurnstileWidget siteKey="site-1" onVerify={() => {}} />);
    expect(screen.getByLabelText('Bot protection')).toBeInTheDocument();
  });

  it('renders through the turnstile api when it is already loaded and forwards tokens', () => {
    const removeSpy = vi.fn();
    const renderSpy = vi.fn().mockReturnValue('widget-1');
    window.turnstile = { render: renderSpy, remove: removeSpy, reset: vi.fn() };
    const onVerify = vi.fn();
    const { unmount } = render(<TurnstileWidget siteKey="site-1" onVerify={onVerify} />);
    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(renderSpy.mock.calls[0]![1]).toMatchObject({ sitekey: 'site-1', theme: 'auto', size: 'normal' });
    (renderSpy.mock.calls[0]![1] as { callback: (token: string) => void }).callback('tok-1');
    expect(onVerify).toHaveBeenCalledWith('tok-1');
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('widget-1');
  });

  it('lazy-loads the turnstile script when the api is missing', () => {
    render(<TurnstileWidget siteKey="site-1" onVerify={() => {}} />);
    const script = document.head.querySelector<HTMLScriptElement>('script[src*="challenges.cloudflare.com/turnstile"]');
    expect(script).not.toBeNull();
    // jsdom does not reflect `async` back to the attribute; assert the property.
    expect(script!.async).toBe(true);
  });
});
