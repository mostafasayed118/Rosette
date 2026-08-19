-- Customer order change requests. Customers read their own rows; submit and
-- review both run through the service-role client (the changes diff needs
-- server-side validation a raw RLS insert cannot enforce).
create table if not exists public.order_change_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_id uuid not null references public.profiles(id),
  -- Partial diff: only the fields being changed. Validated at submit and
  -- re-validated when the change is applied.
  changes jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'applied', 'rejected')),
  reason text,
  -- Computed at approval/apply: new total - old total (minor units).
  delta_minor integer,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists order_change_requests_order_idx on public.order_change_requests(order_id);
create index if not exists order_change_requests_status_idx on public.order_change_requests(status);
create index if not exists order_change_requests_customer_idx on public.order_change_requests(customer_id);

alter table public.order_change_requests enable row level security;

create policy "customers read own change requests" on public.order_change_requests
  for select using (customer_id = auth.uid());
