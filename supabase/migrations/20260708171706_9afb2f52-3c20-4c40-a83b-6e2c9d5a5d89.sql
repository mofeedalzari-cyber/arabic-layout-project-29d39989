
-- Fix ambiguous transaction_no by qualifying column in RETURNING
CREATE OR REPLACE FUNCTION public.sell_card(_package_id uuid)
 RETURNS TABLE(sale_id uuid, transaction_no text, card_username text, card_password text, package_name text, network_name text, price numeric, sold_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_username text; v_card record; v_pkg record; v_net record;
  v_sale_id uuid; v_tx text; v_is_admin boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.is_active_user(v_uid) THEN RAISE EXCEPTION 'ACCOUNT_INACTIVE'; END IF;
  v_is_admin := public.has_role(v_uid,'admin');
  IF NOT (v_is_admin OR public.has_role(v_uid,'agent')) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT p.username INTO v_username FROM public.profiles p WHERE p.id = v_uid;
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

  UPDATE public.cards
    SET status = 'SOLD', sold_to = v_uid, sold_at = now()
    WHERE id = v_card.id;

  INSERT INTO public.sales (card_id, package_id, network_id, agent_id, price, package_name, network_name, agent_username)
  VALUES (v_card.id, v_pkg.id, v_net.id, v_uid, v_pkg.price, v_pkg.name, v_net.name, v_username)
  RETURNING public.sales.id, public.sales.transaction_no INTO v_sale_id, v_tx;

  INSERT INTO public.logs (user_id, actor_username, action, entity, entity_id, metadata)
  VALUES (v_uid, v_username, 'SELL_CARD', 'sale', v_sale_id,
          jsonb_build_object('package', v_pkg.name, 'network', v_net.name, 'price', v_pkg.price));

  RETURN QUERY SELECT v_sale_id, v_tx, v_card.username, v_card.password,
                      v_pkg.name, v_net.name, v_pkg.price, now();
END; $function$;

-- Per-package counts visible to admins and agents (bypasses RLS via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.package_counts(_network_id uuid)
 RETURNS TABLE(package_id uuid, available integer, assigned integer, sold integer, my_assigned integer)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  RETURN QUERY
    SELECT p.id,
      COALESCE(SUM(CASE WHEN c.status='AVAILABLE' THEN 1 ELSE 0 END),0)::int,
      COALESCE(SUM(CASE WHEN c.status='ASSIGNED' THEN 1 ELSE 0 END),0)::int,
      COALESCE(SUM(CASE WHEN c.status='SOLD' THEN 1 ELSE 0 END),0)::int,
      COALESCE(SUM(CASE WHEN c.status='ASSIGNED' AND c.assigned_to=v_uid THEN 1 ELSE 0 END),0)::int
    FROM public.packages p
    LEFT JOIN public.cards c ON c.package_id = p.id
    WHERE p.network_id = _network_id
    GROUP BY p.id;
END; $function$;

GRANT EXECUTE ON FUNCTION public.package_counts(uuid) TO authenticated;
