import Link from 'next/link';

export default function NotFound() {
  return <main className="center-state"><p className="eyebrow">A quiet detour</p><h1>That page has wandered off.</h1><p>Let&apos;s take you back to the collection.</p><Link className="button" href="/shop">Browse flowers <span aria-hidden="true">↗</span></Link></main>;
}
