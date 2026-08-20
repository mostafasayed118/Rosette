-- Email-wide opt-out for optional engagement messages.
-- Reads and writes use the service-role client; there are no public policies.
create table if not exists public.email_preferences (
  email text primary key,
  engagement_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.email_preferences enable row level security;

alter table public.carts
  add column if not exists engagement_suppressed_at timestamptz;
