-- 040_subscription_security_indexes.sql
-- Complete the subscription perimeter and make the cron/admin access paths
-- selective. All subscription writes remain service_role-only.

alter table public.subscription_plans       enable row level security;
alter table public.subscriptions            enable row level security;
alter table public.subscription_deliveries  enable row level security;
alter table public.subscription_events      enable row level security;

drop policy if exists "public can read active subscription plans" on public.subscription_plans;
create policy "public can read active subscription plans" on public.subscription_plans
  for select to anon, authenticated using (active = true);

drop policy if exists "deny client subscription rows" on public.subscriptions;
create policy "deny client subscription rows" on public.subscriptions
  for all to anon, authenticated using (false) with check (false);

drop policy if exists "deny client subscription deliveries" on public.subscription_deliveries;
create policy "deny client subscription deliveries" on public.subscription_deliveries
  for all to anon, authenticated using (false) with check (false);

drop policy if exists "deny client subscription events" on public.subscription_events;
create policy "deny client subscription events" on public.subscription_events
  for all to anon, authenticated using (false) with check (false);

revoke select, insert, update, delete, truncate on public.subscriptions,
  public.subscription_deliveries, public.subscription_events
  from anon, authenticated;
grant select on public.subscription_plans to anon, authenticated;

-- The RLS policies created by 018/031/036 were dead after 028 revoked the
-- blanket Data API grant. Restore the minimum grant; RLS remains authoritative.
grant select on
  public.recipients,
  public.occasions,
  public.occasion_reminders
  to authenticated;

grant select, insert, update, delete on
  public.user_preferences,
  public.address_book
  to authenticated;

create index if not exists subscriptions_customer_status_idx
  on public.subscriptions(customer_id, status);
create index if not exists subscription_deliveries_due_idx
  on public.subscription_deliveries(status, scheduled_date);
create index if not exists subscription_deliveries_subscription_status_idx
  on public.subscription_deliveries(subscription_id, status);
create index if not exists subscription_events_subscription_idx
  on public.subscription_events(subscription_id, created_at desc);
