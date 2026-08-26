import { cloneElement, isValidElement, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function KeyValueRow({ label, value }: { label: string; value: ReactNode }) {
  let renderedValue: ReactNode = value;
  if (isValidElement(value)) {
    const childProps = value.props as { className?: string };
    renderedValue = cloneElement(value, {
      className: cn(childProps.className, 'text-foreground'),
    } as Record<string, unknown>);
  }
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-end text-foreground">{renderedValue}</dd>
    </div>
  );
}
