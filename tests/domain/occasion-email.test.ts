import { describe, expect, it, vi } from 'vitest';
import { renderOccasionEmail, sendOccasionEmail } from '@/features/occasions/email';

const base = {
  recipientName: 'Mum',
  occasionKind: 'birthday',
  daysUntil: 7,
  shopUrl: 'https://rosette.test/en/cairo/shop?occasion=birthday&recipient=r1',
} as const;

describe('renderOccasionEmail', () => {
  it('names the recipient and the countdown in the English subject', () => {
    const { subject } = renderOccasionEmail({ ...base, locale: 'en' });
    expect(subject).toContain('Mum');
    expect(subject).toContain('7 days');
  });

  it('uses the singular form for one day', () => {
    const { subject } = renderOccasionEmail({ ...base, daysUntil: 1, locale: 'en' });
    expect(subject).toContain('1 day');
    expect(subject).not.toContain('1 days');
  });

  it('renders an Arabic subject', () => {
    const { subject } = renderOccasionEmail({ ...base, locale: 'ar' });
    expect(subject).toMatch(/[\u0600-\u06FF]/);
    expect(subject).toContain('Mum');
  });

  it('renders a French subject', () => {
    const { subject } = renderOccasionEmail({ ...base, locale: 'fr' });
    expect(subject).toContain('Mum');
    expect(subject).toContain('7 jours');
  });

  it('links to the filtered collection', () => {
    const { html, text } = renderOccasionEmail({ ...base, locale: 'en' });
    expect(html).toContain('occasion=birthday');
    expect(text).toContain('occasion=birthday');
  });

  it('escapes HTML in the recipient name', () => {
    const { html } = renderOccasionEmail({ ...base, recipientName: '<script>x</script>', locale: 'en' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('includes the engagement footer when an unsubscribe url is supplied', () => {
    const withFooter = renderOccasionEmail({ ...base, locale: 'en', unsubscribeUrl: 'https://rosette.test/unsub?t=1' });
    const without = renderOccasionEmail({ ...base, locale: 'en' });
    expect(withFooter.html.length).toBeGreaterThan(without.html.length);
    expect(withFooter.html).toContain('unsub');
  });

  it('sets the html lang attribute per locale', () => {
    expect(renderOccasionEmail({ ...base, locale: 'ar' }).html).toContain('lang="ar"');
  });
});

describe('sendOccasionEmail', () => {
  it('sends through the injected transport', async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    await sendOccasionEmail({ ...base, locale: 'en', to: 'nour@example.com' }, { sendMail });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const message = sendMail.mock.calls[0]![0] as { to: string; subject: string };
    expect(message.to).toBe('nour@example.com');
    expect(message.subject).toContain('Mum');
  });

  it('adds one-click unsubscribe headers when available', async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    await sendOccasionEmail(
      { ...base, locale: 'en', to: 'nour@example.com', unsubscribeUrl: 'https://rosette.test/unsub?t=1' },
      { sendMail },
    );
    const message = sendMail.mock.calls[0]![0] as { headers?: Record<string, string> };
    expect(message.headers?.['List-Unsubscribe']).toContain('https://rosette.test/unsub?t=1');
    expect(message.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });
});
