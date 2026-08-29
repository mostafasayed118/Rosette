import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Custom font-size tokens from the app theme (app/globals.css). Without this,
 * tailwind-merge classifies `text-body-lg` & co. as text COLORS (they are not
 * default t-shirt sizes), so `cn('text-on-primary', 'text-body-lg')` silently
 * drops the color class — the dark illegible-CTA bug in DestinationGate.
 */
const TEXT_SIZES = [
  'display-xl',
  'display-xl-mobile',
  'display',
  'headline-lg',
  'headline-sm',
  'body-lg',
  'body-md',
  'meta-mono',
  'md',
] as const;

const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: [...TEXT_SIZES] }] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
