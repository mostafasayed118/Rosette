-- 046_webhook_events.sql
-- R-15 replay protection for the Paymob webhook.
--
-- The callback signature is already verified (constant-time HMAC, query-param
-- preferred). This table is the *processed-event ledger* that makes delivery
-- idempotent: each (provider, provider_reference) may be recorded at most once,
-- so a captured/replayed callback can never re-trigger a state change (e.g.
-- flip payment_failed -> paid) or re-fire notifications.
--
-- Idempotent: safe to re-run; uses IF NOT EXISTS and a no-op guard.

create table if not exists public.webhook_events (
  provider           text        not null,
  provider_reference text        not null,
  event_type         text        not null default 'unknown',
  received_at        timestamptz not null default now(),
  -- The composite primary key IS the uniqueness guarantee: the same
  -- (provider, provider_reference) pair can only ever be inserted once.
  -- `insert ... on conflict (provider, provider_reference) do nothing`
  -- therefore makes concurrent replays a silent no-op rather than a duplicate
  -- payment event.
  primary key (provider, provider_reference)
);

-- Speed up the "has this already been processed?" lookup and any
-- time-based cleanup of old ledger rows.
create index if not exists webhook_events_received_at_idx
  on public.webhook_events (received_at);

-- Ledger rows are written by the service_role webhook handler only; no
-- direct access for anon/authenticated clients.
revoke all on table public.webhook_events from public, anon, authenticated;
grant  all on table public.webhook_events to service_role;
