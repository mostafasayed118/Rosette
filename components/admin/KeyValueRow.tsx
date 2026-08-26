import type { ReactNode } from 'react';

export function KeyValueRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-end text-foreground">{value}</dd>
    </div>
  );
}