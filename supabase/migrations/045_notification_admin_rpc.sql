-- 045_notification_admin_rpc.sql
-- Replace the unbounded JS read + filter/sort/slice in
-- features/admin/notification-admin.ts with bounded Postgres RPCs.
-- Mirrors 039_dashboard_rpc.sql: SECURITY DEFINER, STABLE, service_role-only.
--
-- The "stuck" predicate replicates isStuckRow() from
-- features/notifications/notification-retry.ts:
--   failed     -> attempts < p_max_attempts
--   pending    -> created_at <= p_now - p_stale_pending_ms
-- Limits default to MAX_ATTEMPTS = 3 and STALE_PENDING_MS = 900000 (15 min).

create or replace function public.admin_notification_deliveries(
  p_page_size int default 10,
  p_page_offset int default 0,
  p_q text default null,
  p_status text default null,
  p_type text default null,
  p_now timestamptz default now(),
  p_max_attempts int default 3,
  p_stale_pending_ms bigint default 900000
)
returns table (
  id text,
  type text,
  recipient text,
  locale text,
  status text,
  attempts int,
  last_error text,
  created_at timestamptz,
  order_number text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    d.id,
    d.type,
    d.recipient,
    d.locale,
    d.status,
    d.attempts,
    d.last_error,
    d.created_at,
    o.display_number as order_number
  from public.notification_deliveries d
  left join public.orders o on o.id = d.order_id
  where d.status in ('failed', 'pending')
    and (
      (d.status = 'failed' and d.attempts < p_max_attempts)
      or
      (d.status = 'pending'
        and d.created_at <= p_now - make_interval(secs => (p_stale_pending_ms / 1000.0)::double precision))
    )
    and (p_q is null or p_q = ''
         or o.display_number ilike '%' || p_q || '%'
         or d.recipient ilike '%' || p_q || '%')
    and (p_status is null or d.status = p_status)
    and (p_type is null or d.type = p_type)
  order by d.created_at desc
  limit p_page_size
  offset p_page_offset;
$$;

create or replace function public.admin_notification_deliveries_count(
  p_q text default null,
  p_status text default null,
  p_type text default null,
  p_now timestamptz default now(),
  p_max_attempts int default 3,
  p_stale_pending_ms bigint default 900000
)
returns int
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::int
  from public.notification_deliveries d
  left join public.orders o on o.id = d.order_id
  where d.status in ('failed', 'pending')
    and (
      (d.status = 'failed' and d.attempts < p_max_attempts)
      or
      (d.status = 'pending'
        and d.created_at <= p_now - make_interval(secs => (p_stale_pending_ms / 1000.0)::double precision))
    )
    and (p_q is null or p_q = ''
         or o.display_number ilike '%' || p_q || '%'
         or d.recipient ilike '%' || p_q || '%')
    and (p_status is null or d.status = p_status)
    and (p_type is null or d.type = p_type);
$$;

revoke all on function public.admin_notification_deliveries(int, int, text, text, text, timestamptz, int, bigint)
  from public, anon, authenticated;
grant execute on function public.admin_notification_deliveries(int, int, text, text, text, timestamptz, int, bigint)
  to service_role;

revoke all on function public.admin_notification_deliveries_count(text, text, text, timestamptz, int, bigint)
  from public, anon, authenticated;
grant execute on function public.admin_notification_deliveries_count(text, text, text, timestamptz, int, bigint)
  to service_role;
