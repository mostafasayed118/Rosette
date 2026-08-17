import type { ReactNode } from 'react';

type StatusMessageProps = { title: string; children?: ReactNode; tone?: 'neutral' | 'error' | 'success' };

export function StatusMessage({ title, children, tone = 'neutral' }: StatusMessageProps) {
  return <div className={`status-message status-${tone}`} role={tone === 'error' ? 'alert' : undefined}><strong>{title}</strong>{children ? <p>{children}</p> : null}</div>;
}
