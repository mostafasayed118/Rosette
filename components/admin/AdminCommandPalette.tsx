'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

type Item = { href: string; label: string };

export function AdminCommandPalette({ items }: { items: Item[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((it) => it.label.toLowerCase().includes(needle) || it.href.toLowerCase().includes(needle));
  }, [q, items]);

  function go(href: string) {
    setOpen(false);
    setQ('');
    router.push(href);
  }

  return (
    <>
      <Button variant="outline" size="sm" className="hidden md:inline-flex gap-2 text-muted-foreground" onClick={() => setOpen(true)} aria-label="Search navigation">
        <Search className="h-4 w-4" />
        <span className="hidden lg:inline">Search</span>
        <kbd className="ml-2 hidden lg:inline-flex h-5 items-center rounded border bg-muted px-1.5 text-xs">⌘K</kbd>
      </Button>
      <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)} aria-label="Search">
        <Search className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 gap-0 sm:max-w-lg">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="sr-only">Search admin</DialogTitle>
            <Input autoFocus placeholder="Search pages, e.g. orders, products..." value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && filtered[0]) go(filtered[0].href); }} />
          </DialogHeader>
          <div className="max-h-64 overflow-auto p-2">
            {filtered.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No results</p>
            ) : (
              <ul className="grid gap-1">
                {filtered.map((it) => (
                  <li key={it.href}>
                    <button
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => go(it.href)}
                    >
                      <span>{it.label}</span>
                      <span className="text-xs text-muted-foreground">{it.href}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
