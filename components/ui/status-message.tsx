import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type StatusMessageProps = { title: string; children?: ReactNode; tone?: 'neutral' | 'error' | 'success' };

export function StatusMessage({ title, children, tone = 'neutral' }: StatusMessageProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className={cn(
        'rounded-2xl border bg-card p-6 shadow-sm',
        tone === 'error' && 'border-destructive/40 bg-destructive/5',
        tone === 'success' && 'border-success/40 bg-success/5',
      )}
    >
      <strong>{title}</strong>
      {children ? <p className="mt-1 text-sm text-muted-foreground">{children}</p> : null}
    </div>
  );
}
