-- Guard refund_gift_card_redemption against minting store credit: only credit
-- balance back when a matching 'redeem' transaction exists for this order.
-- Previously an unredeemed (hold-released) order reaching cancellation review
-- could inflate the card balance without anything ever having been deducted.

create or replace function public.refund_gift_card_redemption(
  p_gift_card_id uuid,
  p_order_id uuid,
  p_amount_minor integer,
  p_idempotency_key text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  card public.gift_cards%rowtype;
begin
  if p_amount_minor <= 0 then raise exception 'INVALID_GIFT_CARD_AMOUNT'; end if;
  if exists (select 1 from public.gift_card_transactions where idempotency_key = p_idempotency_key) then return true; end if;
  -- Nothing was redeemed for this order, so there is nothing to restore.
  if not exists (
    select 1 from public.gift_card_transactions
    where gift_card_id = p_gift_card_id and order_id = p_order_id and type = 'redeem'
  ) then
    return true;
  end if;
  select * into card from public.gift_cards where id = p_gift_card_id for update;
  if not found or card.status = 'void' or card.balance_minor + p_amount_minor > card.initial_balance_minor then raise exception 'INVALID_GIFT_CARD_REFUND'; end if;
  update public.gift_cards set balance_minor = balance_minor + p_amount_minor, status = 'active', updated_at = now() where id = card.id;
  insert into public.gift_card_transactions(gift_card_id, type, amount_minor, order_id, idempotency_key, metadata)
  values (card.id, 'refund', p_amount_minor, p_order_id, p_idempotency_key, '{}'::jsonb);
  return true;
end;
$$;
