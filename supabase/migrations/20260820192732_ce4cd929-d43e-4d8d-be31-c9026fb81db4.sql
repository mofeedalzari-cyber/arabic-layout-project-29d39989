CREATE OR REPLACE FUNCTION public.sell_instant_card(_package_id uuid, _username text, _password text)
RETURNS TABLE(sale_id uuid, transaction_no text, card_username text, card_password text, package_name text, network_name text, price numeric, sold_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_username text;
  v_full_name text;
  v_pkg record;
  v_net record;
  v_card_id uuid;
  v_sale_id uuid;
  v_tx text;
  v_u text := btrim(coalesce(_username,''));
  v_p text := btrim(coalesce(_password,''));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.is_active_user(v_uid) THEN RAISE EXCEPTION 'ACCOUNT_INACTIVE'; END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'agent')) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_u = '' THEN RAISE EXCEPTION 'USERNAME_REQUIRED'; END IF;

  SELECT * INTO v_pkg FROM public.packages WHERE id = _package_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'PACKAGE_NOT_FOUND'; END IF;
  SELECT * INTO v_net FROM public.networks WHERE id = v_pkg.network_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'NETWORK_INACTIVE'; END IF;

  IF EXISTS (SELECT 1 FROM public.cards c WHERE c.network_id = v_net.id AND c.username = v_u) THEN
    RAISE EXCEPTION 'CARD_EXISTS';
  END IF;

  SELECT p.username, p.full_name INTO v_username, v_full_name FROM public.profiles p WHERE p.id = v_uid;

  INSERT INTO public.cards (package_id, network_id, username, password, status, sold_to, sold_at, assigned_to, assigned_at)
  VALUES (v_pkg.id, v_net.id, v_u, NULLIF(v_p,''), 'SOLD', v_uid, now(), v_uid, now())
  RETURNING id INTO v_card_id;

  INSERT INTO public.sales (card_id, package_id, network_id, agent_id, price, package_name, network_name, agent_username, agent_full_name)
  VALUES (v_card_id, v_pkg.id, v_net.id, v_uid, v_pkg.price, v_pkg.name, v_net.name, v_username, COALESCE(v_full_name, v_username))
  RETURNING public.sales.id, public.sales.transaction_no INTO v_sale_id, v_tx;

  INSERT INTO public.logs (user_id, actor_username, action, entity, entity_id, metadata)
  VALUES (v_uid, v_username, 'SELL_INSTANT_CARD', 'sale', v_sale_id,
          jsonb_build_object('package', v_pkg.name, 'network', v_net.name, 'price', v_pkg.price, 'mode', 'instant'));

  RETURN QUERY SELECT v_sale_id, v_tx, v_u, NULLIF(v_p,''), v_pkg.name, v_net.name, v_pkg.price, now();
END; $function$;

REVOKE ALL ON FUNCTION public.sell_instant_card(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sell_instant_card(uuid, text, text) TO authenticated;