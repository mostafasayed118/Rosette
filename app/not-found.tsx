import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return <main className="mx-auto grid min-h-[70vh] w-[min(calc(100%-3rem),80rem)] place-content-center justify-items-start"><p className="text-xs font-bold uppercase tracking-[.16em] text-sage">A quiet detour</p><h1 className="mt-2 mb-6 max-w-[12ch] font-display text-[clamp(2.5rem,6vw,4.5rem)] leading-[.95]">That page has wandered off.</h1><p className="text-muted-foreground">Let&apos;s take you back to the collection.</p><Button asChild className="mt-6"><Link href="/shop">Browse flowers <span aria-hidden="true">↗</span></Link></Button></main>;
}
