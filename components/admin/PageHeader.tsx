import type { ReactNode } from 'react';

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? (
          <p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{eyebrow}</p>
        ) : null}
        <h1 className="font-display text-[clamp(1.75rem,3vw,2.25rem)] leading-tight tracking-[-.02em] text-on-surface">{title}</h1>
        {description ? (
          <p className="mt-2 text-sm text-on-surface-variant max-w-prose">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
