-- 039_dashboard_rpc.sql
-- Replace four unbounded admin-dashboard reads and seven JS passes with one
-- bounded aggregate. The dashboard is service-role-only, matching the existing
-- admin data-access boundary.

create or replace function public.get_admin_dashboard_stats(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_awaiting_fulfillment integer;
  v_revenue_today_minor bigint;
  v_revenue_all_time_minor bigint;
  v_pipeline jsonb;
  v_low_stock jsonb;
  v_active_subscriptions integer;
  v_deliveries_this_week integer;
  v_today date := (p_now at time zone 'UTC')::date;
begin
  select
    count(*) filter (where fulfillment_status not in ('delivered', 'cancelled'))::integer,
    coalesce(sum(total_minor) filter (where created_at >= v_today::timestamptz and created_at < (v_today + 1)::timestamptz), 0)::bigint,
    coalesce(sum(total_minor), 0)::bigint
  into v_awaiting_fulfillment, v_revenue_today_minor, v_revenue_all_time_minor
  from public.orders
  where payment_status = 'paid';

  select jsonb_build_object(
    'confirmed', count(*) filter (where fulfillment_status = 'confirmed')::integer,
    'preparing', count(*) filter (where fulfillment_status = 'preparing')::integer,
    'ready_for_delivery', count(*) filter (where fulfillment_status = 'ready_for_delivery')::integer,
    'out_for_delivery', count(*) filter (where fulfillment_status = 'out_for_delivery')::integer,
    'delivered', count(*) filter (where fulfillment_status = 'delivered')::integer
  )
  into v_pipeline
  from public.orders
  where payment_status = 'paid';

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'variant_id', low.variant_id,
      'name', low.variant_name_en,
      'available', low.available
    ) order by low.available asc, low.variant_id
  ), '[]'::jsonb)
  into v_low_stock
  from (
    select i.variant_id, coalesce(v.name_en, '') as variant_name_en,
           (i.quantity - i.reserved_quantity)::integer as available
    from public.inventory i
    join public.product_variants v on v.id = i.variant_id
    where (i.quantity - i.reserved_quantity) <= 3
    order by (i.quantity - i.reserved_quantity) asc, i.variant_id
    limit 10
  ) as low;

  select count(*)::integer into v_active_subscriptions
  from public.subscriptions
  where status = 'active';

  select count(*)::integer into v_deliveries_this_week
  from public.subscription_deliveries
  where status in ('scheduled', 'ordered')
    and scheduled_date >= v_today
    and scheduled_date < v_today + 7;

  return jsonb_build_object(
    'awaitingFulfillment', coalesce(v_awaiting_fulfillment, 0),
    'revenueTodayMinor', coalesce(v_revenue_today_minor, 0),
    'revenueAllTimeMinor', coalesce(v_revenue_all_time_minor, 0),
    'pipeline', coalesce(v_pipeline, '{}'::jsonb),
    'lowStock', coalesce(v_low_stock, '[]'::jsonb),
    'activeSubscriptions', coalesce(v_active_subscriptions, 0),
    'deliveriesThisWeek', coalesce(v_deliveries_this_week, 0)
  );
end;
$$;

revoke all on function public.get_admin_dashboard_stats(timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_admin_dashboard_stats(timestamptz)
  to service_role;
