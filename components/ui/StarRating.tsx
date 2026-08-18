import { Star } from 'lucide-react';

export function StarRating({ value, size = 14, className = '' }: { value: number; size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((index) => (
        <Star key={index} size={size} className={index <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'} aria-hidden="true" />
      ))}
    </span>
  );
}
