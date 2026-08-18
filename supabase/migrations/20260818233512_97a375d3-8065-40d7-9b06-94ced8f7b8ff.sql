ALTER TABLE public.card_requests ADD COLUMN IF NOT EXISTS agent_full_name TEXT;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS agent_full_name TEXT;

UPDATE public.card_requests cr
SET agent_full_name = COALESCE(p.full_name, p.username)
FROM public.profiles p
WHERE cr.agent_id = p.id AND cr.agent_full_name IS NULL;

UPDATE public.sales s
SET agent_full_name = COALESCE(p.full_name, p.username)
FROM public.profiles p
WHERE s.agent_id = p.id AND s.agent_full_name IS NULL;

CREATE OR REPLACE FUNCTION public.request_cards(
  _package_id uuid, _quantity integer, _notes text DEFAULT NULL::text, _payment_method text DEFAULT 'CREDIT'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_username text;
  v_full_name text;
  v_pkg record;
  v_net record;
  v_id uuid;
  v_pm text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.is_active_user(v_uid) THEN RAISE EXCEPTION 'ACCOUNT_INACTIVE'; END IF;
  IF NOT public.has_role(v_uid,'agent') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 OR _quantity > 10000 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
  v_pm := UPPER(COALESCE(_payment_method,'CREDIT'));
  IF v_pm NOT IN ('CASH','CREDIT') THEN v_pm := 'CREDIT'; END IF;
  SELECT username, full_name INTO v_username, v_full_name FROM public.profiles WHERE id = v_uid;
  SELECT * INTO v_pkg FROM public.packages WHERE id = _package_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'PACKAGE_NOT_FOUND'; END IF;
  SELECT * INTO v_net FROM public.networks WHERE id = v_pkg.network_id;
  INSERT INTO public.card_requests (
    agent_id, agent_username, agent_full_name, package_id, network_id, package_name, network_name,
    quantity, notes, payment_method, unit_price, total_value
  )
  VALUES (
    v_uid, v_username, COALESCE(v_full_name, v_username), v_pkg.id, v_net.id, v_pkg.name, v_net.name,
    _quantity, NULLIF(trim(_notes),''), v_pm, v_pkg.price, v_pkg.price * _quantity
  )
  RETURNING id INTO v_id;
  INSERT INTO public.logs (user_id, actor_username, action, entity, entity_id, metadata)
  VALUES (v_uid, v_username, 'REQUEST_CARDS', 'card_request', v_id,
          jsonb_build_object('package', v_pkg.name, 'quantity', _quantity, 'payment_method', v_pm));
  RETURN v_id;
END; $function$;
REVOKE EXECUTE ON FUNCTION public.request_cards(uuid, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_cards(uuid, integer, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.sell_card(_package_id uuid)
RETURNS TABLE(sale_id uuid, transaction_no text, card_username text, card_password text,
              package_name text, network_name text, price numeric, sold_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_username text;
  v_full_name text;
  v_card record;
  v_pkg record;
  v_net record;
  v_sale_id uuid;
  v_tx text;
  v_is_admin boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.is_active_user(v_uid) THEN RAISE EXCEPTION 'ACCOUNT_INACTIVE'; END IF;
  v_is_admin := public.has_role(v_uid,'admin');
  IF NOT (v_is_admin OR public.has_role(v_uid,'agent')) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT p.username, p.full_name INTO v_username, v_full_name FROM public.profiles p WHERE p.id = v_uid;
  SELECT * INTO v_pkg FROM public.packages WHERE id = _package_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'PACKAGE_NOT_FOUND'; END IF;
  SELECT * INTO v_net FROM public.networks WHERE id = v_pkg.network_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'NETWORK_INACTIVE'; END IF;
  IF v_is_admin THEN
    SELECT * INTO v_card FROM public.cards
      WHERE package_id = _package_id AND status IN ('AVAILABLE','ASSIGNED')
      ORDER BY (status='AVAILABLE') DESC, created_at ASC
      FOR UPDATE SKIP LOCKED LIMIT 1;
  ELSE
    SELECT * INTO v_card FROM public.cards
      WHERE package_id = _package_id AND status = 'ASSIGNED' AND assigned_to = v_uid
      ORDER BY assigned_at ASC NULLS LAST, created_at ASC
      FOR UPDATE SKIP LOCKED LIMIT 1;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_CARDS_AVAILABLE'; END IF;
  UPDATE public.cards SET status = 'SOLD', sold_to = v_uid, sold_at = now() WHERE id = v_card.id;
  INSERT INTO public.sales (card_id, package_id, network_id, agent_id, price, package_name, network_name, agent_username, agent_full_name)
  VALUES (v_card.id, v_pkg.id, v_net.id, v_uid, v_pkg.price, v_pkg.name, v_net.name, v_username, COALESCE(v_full_name, v_username))
  RETURNING public.sales.id, public.sales.transaction_no INTO v_sale_id, v_tx;
  INSERT INTO public.logs (user_id, actor_username, action, entity, entity_id, metadata)
  VALUES (v_uid, v_username, 'SELL_CARD', 'sale', v_sale_id,
          jsonb_build_object('package', v_pkg.name, 'network', v_net.name, 'price', v_pkg.price));
  RETURN QUERY SELECT v_sale_id, v_tx, v_card.username, v_card.password,
                      v_pkg.name, v_net.name, v_pkg.price, now();
END; $$;
REVOKE EXECUTE ON FUNCTION public.sell_card(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sell_card(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.user_fulfill_order(
  _order_id uuid, _user_id uuid, _bank_account text, _bank_ref text
)
RETURNS TABLE(card_username text, card_password text, package_name text, network_name text, price numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_o RECORD;
  v_card RECORD;
  v_uname text;
  v_full_name text;
BEGIN
  SELECT * INTO v_o FROM public.user_orders WHERE id = _order_id AND user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF v_o.status = 'PAID' THEN
    RETURN QUERY SELECT v_o.card_username, v_o.card_password, v_o.package_name, v_o.network_name, v_o.price;
    RETURN;
  END IF;

  SELECT * INTO v_card FROM public.cards
    WHERE package_id = v_o.package_id AND status = 'AVAILABLE'
    ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_CARDS_AVAILABLE'; END IF;

  UPDATE public.cards SET status = 'SOLD', sold_to = _user_id, sold_at = now() WHERE id = v_card.id;
  SELECT username, full_name INTO v_uname, v_full_name FROM public.profiles WHERE id = _user_id;

  INSERT INTO public.sales (card_id, package_id, network_id, agent_id, price, package_name,
                            network_name, agent_username, agent_full_name, buyer_name)
  VALUES (v_card.id, v_o.package_id, v_o.network_id, _user_id, v_o.price, v_o.package_name,
          v_o.network_name, COALESCE(v_uname,'user'), COALESCE(v_full_name, v_uname, 'user'), COALESCE(v_uname,'user'));

  UPDATE public.user_orders SET status='PAID', bank_account=_bank_account, bank_ref=_bank_ref,
    card_id=v_card.id, card_username=v_card.username, card_password=v_card.password, paid_at=now()
  WHERE id = _order_id;

  INSERT INTO public.logs (user_id, actor_username, action, entity, entity_id, metadata)
  VALUES (_user_id, COALESCE(v_uname,'user'), 'USER_BUY_CARD', 'user_order', _order_id,
          jsonb_build_object('package', v_o.package_name, 'network', v_o.network_name, 'price', v_o.price));

  RETURN QUERY SELECT v_card.username, v_card.password, v_o.package_name, v_o.network_name, v_o.price;
END; $$;
REVOKE ALL ON FUNCTION public.user_fulfill_order(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_fulfill_order(uuid, uuid, text, text) TO service_role;