-- 034_create_pending_order_groups.sql
-- Extend create_pending_order so one checkout can create several delivery
-- groups. p_groups is an ordered jsonb array; each p_lines entry carries a
-- groupIndex pointing into it. When groups are provided the order's
-- delivery_* columns mirror group 0 (keeps existing admin-list and account
-- queries working). When p_groups is empty the function behaves exactly as
-- before (all item rows get a NULL delivery_group_id, orders.delivery_* come
-- from p_checkout as today).

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
  p_gift_card_minor integer,
  p_groups jsonb default '[]'
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
  v_group jsonb;
  v_inventory_items jsonb;
  v_group_ids uuid[];
  v_group_id uuid;
  v_active_groups boolean := false;
  v_idx integer;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'EMPTY_CART';
  end if;
  if p_total_minor < 0 or p_subtotal_minor < 0 or p_delivery_fee_minor < 0 or p_discount_minor < 0 or p_gift_card_minor < 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_groups is not null
     and jsonb_typeof(p_groups) = 'array'
     and jsonb_array_length(p_groups) > 10 then
    raise exception 'TOO_MANY_GROUPS';
  end if;

  v_active_groups := p_groups is not null and jsonb_typeof(p_groups) = 'array' and jsonb_array_length(p_groups) > 0;

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

  if v_active_groups then
    v_idx := 0;
    for v_group in select * from jsonb_array_elements(coalesce(p_groups, '[]'::jsonb)) loop
      v_idx := v_idx + 1;
      insert into public.order_delivery_groups(
        order_id, position, recipient_name, recipient_phone,
        delivery_address, delivery_date, delivery_window,
        delivery_fee_minor, fulfillment_status, public_token
      ) values (
        v_order_id, v_idx - 1,
        v_group->>'recipientName',
        v_group->>'recipientPhone',
        v_group->>'deliveryAddress',
        (v_group->>'deliveryDate')::date,
        v_group->>'deliveryWindow',
        coalesce((v_group->>'deliveryFeeMinor')::int, 0),
        'confirmed',
        encode(extensions.gen_random_bytes(24), 'hex')
      )
      returning id into v_group_id;
      v_group_ids[v_idx] := v_group_id;
    end loop;

    update public.orders o set
      recipient_name = coalesce(g0.recipient_name, o.recipient_name),
      recipient_phone = coalesce(g0.recipient_phone, o.recipient_phone),
      delivery_address = coalesce(g0.delivery_address, o.delivery_address),
      delivery_date = coalesce(g0.delivery_date, o.delivery_date),
      delivery_window = coalesce(g0.delivery_window, o.delivery_window)
    from public.order_delivery_groups g0
    where o.id = v_order_id and g0.order_id = v_order_id and g0.position = 0;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_group_id := null;
    if v_active_groups then
      v_group_id := v_group_ids[coalesce((v_line->>'groupIndex')::int, 0) + 1];
    end if;
    insert into public.order_items(
      order_id, product_id, variant_id,
      product_slug, product_name_en, product_name_ar, product_name_fr,
      unit_price_minor, quantity, add_ons, gift_message, delivery_group_id
    ) values (
      v_order_id, null, (v_line->>'variantId')::uuid,
      v_line->>'productSlug', v_line->>'productName',
      coalesce(v_line->>'productNameAr', ''), coalesce(v_line->>'productNameFr', ''),
      (v_line->>'unitPrice')::int, (v_line->>'quantity')::int,
      coalesce(v_line->'addOns', '[]'::jsonb), coalesce(v_line->>'message', ''),
      v_group_id
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
