-- upsert_cart: replace the read-then-write loop in features/cart/cart-sync.ts
-- with a single transactional function. The previous JS path could race two
-- concurrent requests and both insert (the second one violated the
-- carts_email_active_idx partial unique index, the route returned 500, and
-- the customer's saved bag was lost). The function takes the new row's
-- fields as jsonb and uses INSERT ... ON CONFLICT to atomically choose
-- between insert and update.
--
-- The customer-scope branch (customer_id scoped by email for signed-in
-- customers, anonymous rows for guests) is preserved exactly as the JS
-- path did it. An empty lines array becomes a delete of the matching
-- active row.

create or replace function public.upsert_cart(
  p_email text,
  p_customer_id uuid,
  p_locale text,
  p_city text,
  p_lines jsonb,
  p_restore_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id uuid;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    if p_customer_id is not null then
      delete from public.carts
       where email = p_email
         and customer_id = p_customer_id
         and converted_at is null;
    else
      delete from public.carts
       where email = p_email
         and customer_id is null
         and converted_at is null;
    end if;
    return jsonb_build_object('status', 'ok', 'restore_token', '');
  end if;

  if p_customer_id is not null then
    select id into v_existing_id
      from public.carts
     where email = p_email
       and customer_id = p_customer_id
       and converted_at is null
     limit 1;
  else
    select id into v_existing_id
      from public.carts
     where email = p_email
       and customer_id is null
       and converted_at is null
     limit 1;
  end if;

  if v_existing_id is not null then
    update public.carts
       set locale = p_locale,
           city = p_city,
           lines = p_lines,
           restore_token = p_restore_token,
           updated_at = now()
     where id = v_existing_id;
  else
    insert into public.carts(email, customer_id, locale, city, lines, restore_token, updated_at)
    values (p_email, p_customer_id, p_locale, p_city, p_lines, p_restore_token, now());
  end if;

  return jsonb_build_object('status', 'ok', 'restore_token', p_restore_token);
end;
$$;
