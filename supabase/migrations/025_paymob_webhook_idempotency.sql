-- Paymob webhook idempotency: drop the success/failure suffix from the
-- payments.idempotency_key so a late success callback cannot double-write a
-- payments row, and add a quarantine table for bad payloads so amount
-- mismatches are no longer a retry-pinned 400 loop.

create table if not exists public.webhook_quarantine (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_reference text,
  payload jsonb not null,
  error_message text not null,
  received_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists webhook_quarantine_received_idx
  on public.webhook_quarantine(received_at desc) where resolved_at is null;
create index if not exists webhook_quarantine_reference_idx
  on public.webhook_quarantine(provider, provider_reference) where resolved_at is null;

alter table public.webhook_quarantine enable row level security;

create policy "deny all" on public.webhook_quarantine for all to authenticated, anon using (false);

-- payment_status is allowed to flip from payment_failed back to paid when a
-- real success callback arrives after a failure. The existing CHECK constraint
-- on orders already permits this transition; the new index lets the webhook
-- route use it without scanning the whole payments table.
create index if not exists payments_reference_idx
  on public.payments(provider_reference) where provider_reference is not null;
