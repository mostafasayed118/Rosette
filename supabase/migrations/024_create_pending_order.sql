-- create_pending_order: move the multi-step order-creation flow from
-- features/order/supabase-repository.ts into one PL/pgSQL function so the
-- order row, order items, gift-card hold, inventory reservation, and promo
-- usage increment either all commit or all roll back. Replaces the previous
-- compensating DELETEs in the JS path that could leak inventory or a
-- gift-card hold if any step failed mid-sequence.
--
-- The function takes authoritative line items and pre-computed totals from
-- the app. The app still owns price-catalog lookup, promo validation, and
-- delivery-fee calculation; the database owns the write integrity of those
-- values once they have been decided.
--
-- The whole body runs inside a single implicit transaction. Any raise rolls
-- back every insert and update. The route can safely call Paymob only after
-- this function returns successfully.

create or replace function public.create_pending_order(
  p_lines jsonb,
  p_destination jsonb,
  p_checkout jsonb,
  p_customer_id uuid,
  p_subtotal_minor integer,
  p_delivery_fee_minor integer,
  p_discount_minor integer,
  p_total_minor integer,
  p_promo_code text,
  p_gift_card_minor integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_display_number text;
  v_public_token text;
  v_hold_id uuid;
  v_zero_total_redeemed boolean := false;
  v_gift_card_code_hash text := nullif(p_checkout->>'giftCardCodeHash', '');
  v_gift_card_id text := nullif(p_checkout->>'giftCardId', '');
  v_gift_card_code_last4 text := nullif(p_checkout->>'giftCardCodeLast4', '');
  v_gift_card_amount int := coalesce(p_gift_card_minor, 0);
  v_line jsonb;
  v_inventory_items jsonb;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'EMPTY_CART';
  end if;
  if p_total_minor < 0 or p_subtotal_minor < 0 or p_delivery_fee_minor < 0 or p_discount_minor < 0 or p_gift_card_minor < 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  -- Display number: time + random suffix to keep concurrent checkouts from
  -- colliding on the unique display_number column.
  v_display_number := 'RO-' || upper(to_hex(extract(epoch from clock_timestamp())::bigint)) || '-' || upper(substring(md5(random()::text) for 4));
  v_public_token := encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.orders(
    display_number, public_token, customer_id,
    customer_email, customer_phone, recipient_name, recipient_phone,
    delivery_address, delivery_city_code, delivery_date, delivery_window,
    locale,
    subtotal_minor, delivery_fee_minor, total_minor,
    gift_card_minor, gift_card_id, gift_card_code_last4,
    discount_minor, promo_code
  ) values (
    v_display_number, v_public_token, p_customer_id,
    p_checkout->>'customerEmail', p_checkout->>'customerPhone', p_checkout->>'recipientName', p_checkout->>'recipientPhone',
    p_checkout->>'deliveryAddress', p_destination->>'cityCode', (p_checkout->>'deliveryDate')::date, p_checkout->>'deliveryWindow',
    coalesce(p_checkout->>'locale', 'en'),
    p_subtotal_minor, p_delivery_fee_minor, p_total_minor,
    v_gift_card_amount, nullif(v_gift_card_id, '')::uuid, v_gift_card_code_last4,
    p_discount_minor, nullif(p_promo_code, '')
  )
  returning id into v_order_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    insert into public.order_items(
      order_id, product_id, variant_id,
      product_slug, product_name_en, product_name_ar, product_name_fr,
      unit_price_minor, quantity, add_ons, gift_message
    ) values (
      v_order_id, null, (v_line->>'variantId')::uuid,
      v_line->>'productSlug', v_line->>'productName',
      coalesce(v_line->>'productNameAr', ''), coalesce(v_line->>'productNameFr', ''),
      (v_line->>'unitPrice')::int, (v_line->>'quantity')::int,
      coalesce(v_line->'addOns', '[]'::jsonb), coalesce(v_line->>'message', '')
    );
  end loop;

  select jsonb_agg(jsonb_build_object('variant_id', element->>'variantId', 'quantity', (element->>'quantity')::int))
    into v_inventory_items
    from jsonb_array_elements(p_lines) as element;
  perform public.reserve_order_inventory(v_order_id, v_inventory_items);

  if v_gift_card_code_hash is not null and v_gift_card_amount > 0 then
    v_hold_id := public.reserve_gift_card(v_gift_card_code_hash, v_order_id, v_gift_card_amount);
    update public.orders set gift_card_hold_id = v_hold_id where id = v_order_id;
    if p_total_minor = 0 then
      perform public.redeem_gift_card_hold(v_hold_id, 'gift-card-zero:' || v_order_id::text);
      update public.orders set payment_status = 'paid' where id = v_order_id;
      insert into public.payments(order_id, provider, provider_reference, idempotency_key, amount_minor, currency, status)
      values (v_order_id, 'gift_card', null, 'gift-card-zero-payment:' || v_order_id::text, 0, 'EGP', 'paid');
      v_zero_total_redeemed := true;
    end if;
  end if;

  if p_promo_code is not null and p_promo_code <> '' then
    perform public.increment_promo_usage(p_promo_code);
  end if;

  return jsonb_build_object(
    'order', (select row_to_json(o) from public.orders o where id = v_order_id),
    'gift_card_hold_id', v_hold_id,
    'zero_total_redeemed', v_zero_total_redeemed
  );
end;
$$;
