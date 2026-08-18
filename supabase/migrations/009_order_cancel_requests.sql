-- Customer cancellation requests. Customers read/create their own;
-- approve/reject runs through the service-role client only.
create table if not exists public.order_cancel_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_id uuid not null references public.profiles(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reason text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists order_cancel_requests_order_idx on public.order_cancel_requests(order_id);
create index if not exists order_cancel_requests_status_idx on public.order_cancel_requests(status);

alter table public.order_cancel_requests enable row level security;

create policy "customers read own cancel requests" on public.order_cancel_requests
  for select using (customer_id = auth.uid());

create policy "customers create cancel requests for own orders" on public.order_cancel_requests
  for insert with check (
    customer_id = auth.uid()
    and exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid())
  );
