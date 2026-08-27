'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
      reset: (id: string) => void;
    };
    onTurnstileCallback?: (token: string) => void;
  }
}

export type TurnstileWidgetProps = {
  siteKey: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  size?: 'normal' | 'compact';
};

/**
 * Cloudflare Turnstile - FREE unlimited bot protection.
 * Replaces CAPTCHA with privacy-preserving check.
 * Works on Cloudflare Workers (no Node APIs).
 * Docs: https://developers.cloudflare.com/turnstile/
 */
export function TurnstileWidget({ siteKey, onVerify, onExpire, onError, theme = 'auto', size = 'normal' }: TurnstileWidgetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  // Keep latest callbacks in a ref so the widget isn't torn down and re-created
  // every time CheckoutForm re-renders (inline arrows = new refs each render).
  // Only siteKey/theme/size changes should re-render the widget.
  const callbacksRef = useRef({ onVerify, onExpire, onError });

  useEffect(() => {
    // Mirror the latest callbacks without re-arming the render effect.
    callbacksRef.current = { onVerify, onExpire, onError };
  }, [onVerify, onExpire, onError]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !siteKey) return;

    const render = () => {
      if (!window.turnstile || !ref.current) return;
      // Don't re-render an existing widget on effect re-run for theme/size alone;
      // only create once per mount. This prevents the "flash" when parent re-renders.
      if (widgetIdRef.current) return;
      const cb = callbacksRef.current;
      widgetIdRef.current = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        theme,
        size,
        callback: (token: string) => cb.onVerify(token),
        'expired-callback': () => cb.onExpire?.(),
        'error-callback': () => cb.onError?.(),
      });
    };

    if (window.turnstile) {
      render();
    } else {
      const script = document.querySelector<HTMLScriptElement>('script[src*="challenges.cloudflare.com/turnstile"]');
      if (script) {
        // If the shared script is still loading, wait for it; else render now.
        if (window.turnstile) render();
        else script.addEventListener('load', render, { once: true });
      } else {
        const s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        s.async = true;
        s.defer = true;
        s.onload = render;
        document.head.appendChild(s);
      }
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {}
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, theme, size]);

  if (!siteKey) return null;
  return <div ref={ref} className="turnstile-widget" aria-label="Bot protection" />;
}
