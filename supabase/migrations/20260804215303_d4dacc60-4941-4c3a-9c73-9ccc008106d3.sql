ALTER TABLE public.user_orders
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS reject_reason text,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

CREATE OR REPLACE FUNCTION public.user_request_card(_package_id uuid, _customer_name text, _note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _p record;
  _id uuid;
  _name text := nullif(btrim(coalesce(_customer_name, '')), '');
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF _name IS NULL THEN RAISE EXCEPTION 'NAME_REQUIRED'; END IF;

  SELECT p.id, p.name, p.price, p.network_id, n.name AS network_name
    INTO _p
  FROM public.packages p
  JOIN public.networks n ON n.id = p.network_id
  WHERE p.id = _package_id AND p.is_active AND n.is_active;

  IF _p.id IS NULL THEN RAISE EXCEPTION 'PACKAGE_NOT_FOUND'; END IF;

  INSERT INTO public.user_orders (
    user_id, package_id, network_id, package_name, network_name, price, status, customer_name, note
  ) VALUES (
    _uid, _p.id, _p.network_id, _p.name, _p.network_name, _p.price, 'PENDING', _name, nullif(btrim(coalesce(_note,'')), '')
  ) RETURNING id INTO _id;

  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.my_orders()
RETURNS TABLE(
  id uuid, package_name text, network_name text, price numeric, status text,
  customer_name text, reject_reason text, card_username text, card_password text,
  created_at timestamptz, approved_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.package_name, o.network_name, o.price, o.status,
         o.customer_name, o.reject_reason,
         CASE WHEN o.status = 'PAID' THEN o.card_username ELSE NULL END,
         CASE WHEN o.status = 'PAID' THEN o.card_password ELSE NULL END,
         o.created_at, o.approved_at
  FROM public.user_orders o
  WHERE o.user_id = auth.uid()
  ORDER BY o.created_at DESC
$$;

CREATE OR REPLACE FUNCTION public.admin_user_orders(_status text DEFAULT NULL)
RETURNS TABLE(
  id uuid, user_id uuid, customer_name text, username text, phone text,
  package_id uuid, package_name text, network_id uuid, network_name text,
  price numeric, status text, note text, reject_reason text,
  available integer, created_at timestamptz, approved_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.user_id, o.customer_name, pr.username, pr.phone,
         o.package_id, o.package_name, o.network_id, o.network_name,
         o.price, o.status, o.note, o.reject_reason,
         (SELECT count(*)::int FROM public.cards c WHERE c.package_id = o.package_id AND c.status = 'AVAILABLE'),
         o.created_at, o.approved_at
  FROM public.user_orders o
  LEFT JOIN public.profiles pr ON pr.id = o.user_id
  WHERE (public.is_superadmin(auth.uid()) OR o.network_id = public.admin_network(auth.uid()))
    AND (_status IS NULL OR o.status = _status)
  ORDER BY (o.status = 'PENDING') DESC, o.created_at DESC
$$;

CREATE OR REPLACE FUNCTION public.approve_user_order(_order_id uuid)
RETURNS TABLE(card_username text, card_password text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _o record;
  _card record;
BEGIN
  SELECT * INTO _o FROM public.user_orders WHERE id = _order_id;
  IF _o.id IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF NOT (public.is_superadmin(_uid) OR _o.network_id = public.admin_network(_uid)) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF _o.status = 'PAID' THEN
    RETURN QUERY SELECT _o.card_username, _o.card_password;
    RETURN;
  END IF;
  IF _o.status <> 'PENDING' THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;

  SELECT * INTO _card FROM public.cards
  WHERE package_id = _o.package_id AND status = 'AVAILABLE'
  ORDER BY created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF _card.id IS NULL THEN RAISE EXCEPTION 'NO_CARDS_AVAILABLE'; END IF;

  UPDATE public.cards
     SET status = 'SOLD', sold_to = _o.user_id, sold_at = now()
   WHERE id = _card.id;

  UPDATE public.user_orders
     SET status = 'PAID', card_id = _card.id, card_username = _card.username,
         card_password = _card.password, approved_by = _uid, approved_at = now(),
         paid_at = now(), updated_at = now()
   WHERE id = _o.id;

  RETURN QUERY SELECT _card.username, _card.password;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_user_order(_order_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _o record;
BEGIN
  SELECT * INTO _o FROM public.user_orders WHERE id = _order_id;
  IF _o.id IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF NOT (public.is_superadmin(_uid) OR _o.network_id = public.admin_network(_uid)) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF _o.status <> 'PENDING' THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;

  UPDATE public.user_orders
     SET status = 'REJECTED', reject_reason = nullif(btrim(coalesce(_reason,'')), ''), updated_at = now()
   WHERE id = _o.id;
END;
$$;

REVOKE ALL ON FUNCTION public.user_request_card(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_orders() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_user_orders(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_user_order(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_user_order(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_request_card(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_orders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_orders(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_user_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_user_order(uuid, text) TO authenticated;