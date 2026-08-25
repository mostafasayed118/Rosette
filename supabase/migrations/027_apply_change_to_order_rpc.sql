-- apply_change_to_order: apply an approved change-request diff to an order
-- atomically. The previous JS path updated the orders row first and then
-- looped over each changed order_items row. If the orders update succeeded
-- but the first item update failed, the order's totals and address fields
-- were already moved while items were stale, leaving the order in an
-- inconsistent state. This function does both updates inside one
-- transaction so a failure rolls back every change.
--
-- Validation (item existence, quantity, message length) is the caller's
-- responsibility: the function is the integrity boundary, not the
-- validation boundary.

create or replace function public.apply_change_to_order(
  p_order_id uuid,
  p_order_updates jsonb,
  p_subtotal_minor integer,
  p_total_minor integer,
  p_items jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
begin
  if p_subtotal_minor < 0 or p_total_minor < 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  update public.orders
     set subtotal_minor = p_subtotal_minor,
         total_minor = p_total_minor,
         updated_at = now()
   where id = p_order_id;

  if p_order_updates is not null and p_order_updates <> '{}'::jsonb then
    update public.orders
       set delivery_date = coalesce(p_order_updates->>'delivery_date', delivery_date),
           delivery_window = coalesce(p_order_updates->>'delivery_window', delivery_window),
           recipient_name = coalesce(p_order_updates->>'recipient_name', recipient_name),
           recipient_phone = coalesce(p_order_updates->>'recipient_phone', recipient_phone),
           delivery_address = coalesce(p_order_updates->>'delivery_address', delivery_address),
           updated_at = now()
     where id = p_order_id;
  end if;

  if p_items is not null and jsonb_typeof(p_items) = 'array' then
    for v_item in select * from jsonb_array_elements(p_items) loop
      update public.order_items
         set quantity = coalesce((v_item->>'quantity')::integer, quantity),
             gift_message = coalesce(v_item->>'gift_message', gift_message)
       where id = (v_item->>'id')::uuid
         and order_id = p_order_id;
    end loop;
  end if;

  return true;
end;
$$;
