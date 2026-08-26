'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-[60vh] place-content-center justify-items-start gap-5 p-8" role="alert">
      <Card className="p-6">
        <h1 className="font-display text-3xl font-medium text-primary">This panel could not load.</h1>
        <p className="max-w-md text-muted-foreground">The request failed. Retry, or check the service logs if it keeps happening.</p>
        <Button variant="default" size="lg" onClick={reset}>Try again</Button>
        {error.digest ? <p className="text-xs text-muted-foreground/70">ref {error.digest}</p> : null}
      </Card>
    </div>
  );
}
