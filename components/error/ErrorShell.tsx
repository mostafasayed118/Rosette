import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export type ErrorShellAction =
  | { label: string; href: string; onRetry?: undefined }
  | { label: string; href?: undefined; onRetry: () => void };

export interface ErrorShellProps {
  status: number;
  eyebrow: string;
  title: string;
  lede: string;
  action?: ErrorShellAction;
  secondaryAction?: { label: string; href: string };
  digest?: string;
  digestLabel?: string;
  children?: ReactNode;
}

export function ErrorShell({ status, eyebrow, title, lede, action, secondaryAction, digest, digestLabel, children }: ErrorShellProps) {
  return (
    <main className="mx-auto grid min-h-[70vh] w-[min(calc(100%-3rem),80rem)] place-content-center justify-items-start" role="alert" aria-labelledby="error-status-heading">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{eyebrow}</p>
      <p
        id="error-status-heading"
        data-testid="error-status"
        aria-hidden="true"
        className="mt-2 mb-2 font-display text-[clamp(2.5rem,6vw,4.5rem)] leading-[.95] text-primary"
      >
        {formatStatus(status)}
      </p>
      <h1 className="mb-6 max-w-[18ch] font-display text-[clamp(1.75rem,4vw,2.5rem)] leading-[1.05] text-foreground">{title}</h1>
      <p className="max-w-prose text-muted-foreground">{lede}</p>
      {children}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {action?.href ? (
          <Button asChild>
            <Link href={action.href}>{action.label} <span aria-hidden="true">↗</span></Link>
          </Button>
        ) : null}
        {action && !action.href ? (
          <Button type="button" onClick={action.onRetry}>{action.label}</Button>
        ) : null}
        {secondaryAction ? (
          <Button asChild variant="outline">
            <Link href={secondaryAction.href}>{secondaryAction.label}</Link>
          </Button>
        ) : null}
      </div>
      {digest ? (
        <p className="mt-8 font-mono text-xs tracking-[.05em] text-muted-foreground/80">
          {digestLabel ? `${digestLabel} ` : ''}<span data-testid="error-digest">{digest}</span>
        </p>
      ) : null}
    </main>
  );
}

function formatStatus(status: number): string {
  const padded = String(status).padStart(3, '0');
  return padded.split('').join('·');
}
