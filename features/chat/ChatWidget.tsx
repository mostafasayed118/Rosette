'use client';

import { useState } from 'react';
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
  return <aside className={`chat-widget ${open ? 'is-open' : ''}`} aria-label={copy.title} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
    {open ? <div className="chat-panel"><div className="chat-panel-header"><strong>{copy.title}</strong><button type="button" aria-label={copy.close} onClick={() => setOpen(false)}>×</button></div><div className="chat-messages" aria-live="polite">{messages.length === 0 ? <p className="chat-empty">{copy.placeholder}</p> : messages.map((message, index) => <p className={`chat-message chat-message-${message.role}`} key={`${message.role}-${index}`}>{message.text}</p>)}{loading ? <p className="chat-message chat-message-assistant">…</p> : null}</div><div className="chat-form"><input value={input} maxLength={500} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void submit(); }} placeholder={copy.placeholder} aria-label={copy.placeholder} /><button type="button" onClick={() => void submit()} disabled={loading || !input.trim()}>{copy.send}</button></div>{whatsappHref ? <a className="chat-whatsapp-link" href={whatsappHref} target="_blank" rel="noreferrer">{t('talkToTeam')} ↗</a> : null}</div> : null}
    <button type="button" className="chat-launcher" aria-label={open ? copy.close : copy.open} aria-expanded={open} onClick={() => setOpen((current) => !current)}>✦</button>
  </aside>;
}
