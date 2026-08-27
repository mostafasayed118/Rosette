-- 033_multi_recipient_orders.sql
-- One order can deliver to several recipients. Groups are first-class children
-- of orders; order_items reference the group they belong to. The orders.*
-- delivery columns remain the source of truth for single-recipient (legacy)
-- orders and mirror group 0 for multi-recipient orders so existing admin/list
-- and account queries keep working.

create table public.order_delivery_groups (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  position integer not null,
  recipient_name text not null,
  recipient_phone text not null,
  delivery_address text not null,
  delivery_date date not null,
  delivery_window text not null,
  delivery_fee_minor integer not null default 0,
  fulfillment_status text not null default 'confirmed'
    check (fulfillment_status in (
      'confirmed','preparing','ready_for_delivery',
      'out_for_delivery','delivered','cancelled')),
  public_token text not null unique,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index order_delivery_groups_order_id_idx
  on public.order_delivery_groups (order_id);

alter table public.order_items
  add column delivery_group_id uuid references public.order_delivery_groups(id);

alter table public.order_cancel_requests
  add column delivery_group_id uuid null
  references public.order_delivery_groups(id);

-- RLS: groups are readable by the owning customer, mirroring how order_items
-- are gated (orders have no public/anon read policy; public reads go through
-- the service-role admin client, which bypasses RLS).
alter table public.order_delivery_groups enable row level security;

create policy "customers read own delivery groups"
  on public.order_delivery_groups
  for select
  using (exists (
    select 1 from public.orders o
    where o.id = order_id and o.customer_id = auth.uid()
  ));