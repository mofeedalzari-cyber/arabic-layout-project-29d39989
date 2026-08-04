-- 1) handle_new_user: support 'user' account type (auto-active, no approval)
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_username TEXT;
  v_full_name TEXT;
  v_phone TEXT;
  v_account_type TEXT;
  v_network_name TEXT;
  v_network_id UUID;
BEGIN
  v_username := COALESCE(NULLIF(NEW.raw_user_meta_data->>'username',''), split_part(NEW.email,'@',1));
  v_full_name := NULLIF(NEW.raw_user_meta_data->>'full_name','');
  v_phone := NULLIF(NEW.raw_user_meta_data->>'phone','');
  v_account_type := lower(COALESCE(NULLIF(NEW.raw_user_meta_data->>'account_type',''),'agent'));
  v_network_name := NULLIF(trim(NEW.raw_user_meta_data->>'network_name'),'');

  INSERT INTO public.profiles (id, username, full_name, phone, is_active, network_id)
  VALUES (NEW.id, v_username, v_full_name, v_phone, false, NULL)
  ON CONFLICT (id) DO UPDATE SET
    username  = EXCLUDED.username,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    phone     = COALESCE(EXCLUDED.phone, public.profiles.phone),
    updated_at = now();

  IF v_account_type = 'user' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
    ON CONFLICT (user_id, role) DO NOTHING;
    UPDATE public.profiles SET is_active = true WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  IF v_account_type = 'network' THEN
    IF v_network_name IS NULL THEN RAISE EXCEPTION 'NETWORK_NAME_REQUIRED'; END IF;
    IF EXISTS (SELECT 1 FROM public.networks WHERE lower(name) = lower(v_network_name)) THEN
      RAISE EXCEPTION 'NETWORK_NAME_TAKEN';
    END IF;
    INSERT INTO public.networks (name, owner_id, created_by, is_active)
    VALUES (v_network_name, NEW.id, NEW.id, true)
    RETURNING id INTO v_network_id;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    UPDATE public.profiles SET network_id = v_network_id, is_active = true WHERE id = NEW.id;
  ELSE
    IF v_network_name IS NULL THEN RAISE EXCEPTION 'NETWORK_NAME_REQUIRED'; END IF;
    SELECT id INTO v_network_id FROM public.networks WHERE lower(name) = lower(v_network_name) LIMIT 1;
    IF v_network_id IS NULL THEN RAISE EXCEPTION 'NETWORK_NOT_FOUND'; END IF;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'agent')
    ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.join_requests (network_id, agent_id, agent_username, agent_full_name, agent_phone)
    VALUES (v_network_id, NEW.id, v_username, v_full_name, v_phone);
  END IF;
  RETURN NEW;
END; $function$;

-- 2) orders table
CREATE TABLE IF NOT EXISTS public.user_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES public.packages(id) ON DELETE RESTRICT,
  network_id uuid NOT NULL REFERENCES public.networks(id) ON DELETE RESTRICT,
  package_name text NOT NULL,
  network_name text NOT NULL,
  price numeric NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  bank_account text,
  bank_ref text,
  card_id uuid REFERENCES public.cards(id) ON DELETE SET NULL,
  card_username text,
  card_password text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_orders_user_idx ON public.user_orders(user_id, created_at DESC);

GRANT SELECT ON public.user_orders TO authenticated;
GRANT ALL ON public.user_orders TO service_role;
ALTER TABLE public.user_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own orders select" ON public.user_orders;
CREATE POLICY "own orders select" ON public.user_orders
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS user_orders_touch ON public.user_orders;
CREATE TRIGGER user_orders_touch BEFORE UPDATE ON public.user_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3) store listing for end users
CREATE OR REPLACE FUNCTION public.user_store()
RETURNS TABLE(package_id uuid, package_name text, network_id uuid, network_name text,
              price numeric, currency text, color text, data_size text, speed text,
              validity text, available integer, admin_phone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT p.id, p.name, n.id, n.name, p.price, n.currency, p.color, p.data_size, p.speed,
         p.validity,
         (SELECT count(*)::int FROM public.cards c
            WHERE c.package_id = p.id AND c.status = 'AVAILABLE'),
         (SELECT pr.phone FROM public.profiles pr WHERE pr.id = n.owner_id)
  FROM public.packages p
  JOIN public.networks n ON n.id = p.network_id
  WHERE p.is_active AND n.is_active
  ORDER BY n.name, p.sort_order, p.price
$$;
REVOKE ALL ON FUNCTION public.user_store() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_store() TO authenticated, service_role;

-- 4) create a purchase order
CREATE OR REPLACE FUNCTION public.user_create_order(_package_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_pkg RECORD; v_net RECORD; v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO v_pkg FROM public.packages WHERE id = _package_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'PACKAGE_NOT_FOUND'; END IF;
  SELECT * INTO v_net FROM public.networks WHERE id = v_pkg.network_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'NETWORK_INACTIVE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cards c
                 WHERE c.package_id = _package_id AND c.status = 'AVAILABLE') THEN
    RAISE EXCEPTION 'NO_CARDS_AVAILABLE';
  END IF;
  INSERT INTO public.user_orders (user_id, package_id, network_id, package_name, network_name, price)
  VALUES (v_uid, v_pkg.id, v_net.id, v_pkg.name, v_net.name, v_pkg.price)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.user_create_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_create_order(uuid) TO authenticated, service_role;

-- 5) fulfillment after verified bank payment (server-only)
CREATE OR REPLACE FUNCTION public.user_fulfill_order(_order_id uuid, _user_id uuid,
                                                     _bank_account text, _bank_ref text)
RETURNS TABLE(card_username text, card_password text, package_name text, network_name text, price numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_o RECORD; v_card RECORD; v_uname text;
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
  SELECT username INTO v_uname FROM public.profiles WHERE id = _user_id;

  INSERT INTO public.sales (card_id, package_id, network_id, agent_id, price, package_name,
                            network_name, agent_username, buyer_name)
  VALUES (v_card.id, v_o.package_id, v_o.network_id, _user_id, v_o.price, v_o.package_name,
          v_o.network_name, COALESCE(v_uname,'user'), COALESCE(v_uname,'user'));

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