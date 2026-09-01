'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/features/i18n/I18nProvider';
import { createWhatsAppHref } from '@/features/support/whatsapp';

type Message = { role: 'user' | 'assistant'; text: string };

export function ChatWidget({ whatsappNumber }: { whatsappNumber?: string }) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const copy = { title: t('chatTitle'), open: t('chatOpen'), close: t('chatClose'), placeholder: t('chatPlaceholder'), send: t('chatSend'), fallback: t('chatFallback') };

  async function submit() {
    const message = input.trim();
    if (!message || loading) return;
    setMessages((current) => [...current, { role: 'user', text: message }]);
    setInput('');
    setLoading(true);
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, language: locale }) });
      const data = await response.json() as { answer?: string };
      setMessages((current) => [...current, { role: 'assistant', text: data.answer ?? copy.fallback }]);
    } catch {
      setMessages((current) => [...current, { role: 'assistant', text: copy.fallback }]);
    } finally {
      setLoading(false);
    }
  }

  const whatsappHref = whatsappNumber ? createWhatsAppHref({ number: whatsappNumber, locale }) : null;
  return <aside className={`fixed bottom-5 z-20 grid justify-items-end gap-3 end-5 ${open ? 'is-open' : ''}`} aria-label={copy.title} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
    {open ? <div className="w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border bg-card shadow-xl"><div className="flex items-center justify-between bg-primary px-4 py-3 text-primary-foreground"><strong>{copy.title}</strong><button className="min-h-11 min-w-11 rounded-md border-0 bg-transparent text-xl text-inherit" type="button" aria-label={copy.close} onClick={() => setOpen(false)}>×</button></div><div className="grid max-h-64 gap-2.5 overflow-y-auto p-3.5" aria-live="polite">{messages.length === 0 ? <p className="m-0 text-sm text-muted-foreground">{copy.placeholder}</p> : messages.map((message, index) => <p className={`my-0 max-w-[90%] rounded-full px-3.5 py-2 text-sm ${message.role === 'user' ? 'justify-self-end bg-accent' : 'justify-self-start bg-secondary'}`} key={`${message.role}-${index}`}>{message.text}</p>)}{loading ? <p className="my-0 max-w-[90%] justify-self-start rounded-full bg-secondary px-3.5 py-2 text-sm">…</p> : null}</div><div className="flex gap-2 border-t p-3"><Input value={input} maxLength={500} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void submit(); }} placeholder={copy.placeholder} aria-label={copy.placeholder} className="min-w-0 flex-1 rounded-full" /><Button size="sm" type="button" onClick={() => void submit()} disabled={loading || !input.trim()}>{copy.send}</Button></div>{whatsappHref ? <a className="block px-3.5 pb-3.5 text-sm text-primary underline underline-offset-4" href={whatsappHref} target="_blank" rel="noreferrer">{t('talkToTeam')} ↗</a> : null}</div> : null}
    <button type="button" className="grid h-[3.25rem] w-[3.25rem] place-items-center rounded-full bg-primary text-primary-foreground shadow-lg" aria-label={open ? copy.close : copy.open} aria-expanded={open} onClick={() => setOpen((current) => !current)}>✦</button>
  </aside>;
}
