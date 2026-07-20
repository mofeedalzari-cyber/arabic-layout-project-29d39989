-- =========================================================
-- Full schema restore + cascade fixes + admin wipe RPC
-- =========================================================

CREATE TYPE public.app_role AS ENUM ('admin', 'agent');
CREATE TYPE public.card_status AS ENUM ('AVAILABLE', 'ASSIGNED', 'SOLD');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  full_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_active_user(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_active FROM public.profiles WHERE id = _user_id), false);
$$;

CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated
  USING ((auth.uid() = id) OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK ((auth.uid() = id) OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admin insert profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete profile" ON public.profiles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "read own roles or admin" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_username TEXT; v_is_first BOOLEAN;
BEGIN
  v_username := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));
  SELECT NOT EXISTS(SELECT 1 FROM public.profiles) INTO v_is_first;
  INSERT INTO public.profiles (id, username, full_name, phone, is_active)
  VALUES (NEW.id, v_username, NEW.raw_user_meta_data->>'full_name',
          NEW.raw_user_meta_data->>'phone', v_is_first);
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN v_is_first THEN 'admin'::app_role ELSE 'agent'::app_role END);
  RETURN NEW;
END; $fn$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_non_admin_activation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_active IS DISTINCT FROM OLD.is_active
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'FORBIDDEN: only admins can change is_active';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER prevent_non_admin_activation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_non_admin_activation();

-- phone column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE TABLE public.networks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  currency TEXT NOT NULL DEFAULT 'ر.س',
  primary_color TEXT NOT NULL DEFAULT '#009688',
  secondary_color TEXT NOT NULL DEFAULT '#14B8A6',
  logo_url TEXT,
  cover_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.networks TO authenticated;
GRANT ALL ON public.networks TO service_role;
ALTER TABLE public.networks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "networks read active for agent, all for admin" ON public.networks FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR (is_active AND public.is_active_user(auth.uid())));
CREATE POLICY "networks admin write" ON public.networks FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "networks admin update" ON public.networks FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "networks admin delete" ON public.networks FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER networks_touch BEFORE UPDATE ON public.networks
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id UUID NOT NULL REFERENCES public.networks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  data_size TEXT, speed TEXT, validity TEXT, description TEXT,
  color TEXT DEFAULT '#009688',
  icon TEXT DEFAULT 'wifi',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.packages TO authenticated;
GRANT ALL ON public.packages TO service_role;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "packages read" ON public.packages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR (is_active AND public.is_active_user(auth.uid())));
CREATE POLICY "packages admin write" ON public.packages FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "packages admin update" ON public.packages FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "packages admin delete" ON public.packages FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER packages_touch BEFORE UPDATE ON public.packages
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX packages_network_idx ON public.packages(network_id);

CREATE TABLE public.cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  network_id UUID NOT NULL REFERENCES public.networks(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  password TEXT,
  status card_status NOT NULL DEFAULT 'AVAILABLE',
  sold_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sold_at TIMESTAMPTZ,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (package_id, username)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cards TO authenticated;
GRANT ALL ON public.cards TO service_role;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cards admin all" ON public.cards FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "cards agent own sold" ON public.cards FOR SELECT TO authenticated
  USING (sold_to = auth.uid());
CREATE POLICY "cards agent own assigned" ON public.cards FOR SELECT TO authenticated
  USING (assigned_to = auth.uid());
CREATE POLICY "cards admin insert" ON public.cards FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "cards admin update" ON public.cards FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "cards admin delete" ON public.cards FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX cards_pkg_status_idx ON public.cards(package_id, status);
CREATE INDEX cards_sold_to_idx ON public.cards(sold_to);
CREATE INDEX cards_assigned_to_idx ON public.cards(assigned_to, package_id) WHERE status = 'ASSIGNED';

CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_no TEXT NOT NULL UNIQUE DEFAULT ('TX-' || to_char(now(),'YYYYMMDD') || '-' || lpad(floor(random()*100000)::text,5,'0')),
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  network_id UUID NOT NULL REFERENCES public.networks(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  price NUMERIC(12,2) NOT NULL,
  package_name TEXT NOT NULL,
  network_name TEXT NOT NULL,
  agent_username TEXT NOT NULL,
  sold_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales admin all" ON public.sales FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "sales agent own" ON public.sales FOR SELECT TO authenticated
  USING (agent_id = auth.uid());
CREATE INDEX sales_agent_idx ON public.sales(agent_id);
CREATE INDEX sales_pkg_idx ON public.sales(package_id);
CREATE INDEX sales_date_idx ON public.sales(sold_at DESC);

CREATE TABLE public.logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_username TEXT,
  action TEXT NOT NULL,
  entity TEXT, entity_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.logs TO authenticated;
GRANT ALL ON public.logs TO service_role;
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "logs admin read" ON public.logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "logs admin delete" ON public.logs FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX logs_created_idx ON public.logs(created_at DESC);

CREATE TABLE public.card_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_username TEXT NOT NULL,
  package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  network_id UUID NOT NULL REFERENCES public.networks(id) ON DELETE CASCADE,
  package_name TEXT NOT NULL,
  network_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  approved_quantity INTEGER,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  notes TEXT, reject_reason TEXT,
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  payment_method TEXT NOT NULL DEFAULT 'CREDIT' CHECK (payment_method IN ('CASH','CREDIT')),
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_requests TO authenticated;
GRANT ALL ON public.card_requests TO service_role;
ALTER TABLE public.card_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cr agent own read" ON public.card_requests FOR SELECT TO authenticated
  USING (agent_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "cr agent insert" ON public.card_requests FOR INSERT TO authenticated
  WITH CHECK (agent_id = auth.uid() AND public.is_active_user(auth.uid()));
CREATE POLICY "cr admin update" ON public.card_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "cr admin delete" ON public.card_requests FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX card_requests_status_idx ON public.card_requests(status, created_at DESC);
CREATE INDEX card_requests_agent_idx ON public.card_requests(agent_id, created_at DESC);
CREATE TRIGGER card_requests_touch BEFORE UPDATE ON public.card_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.request_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.card_requests(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  note TEXT,
  recorded_by UUID NOT NULL,
  recorded_by_username TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.request_payments TO authenticated;
GRANT ALL ON public.request_payments TO service_role;
ALTER TABLE public.request_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read payments" ON public.request_payments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "agents read own payments" ON public.request_payments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.card_requests r WHERE r.id = request_id AND r.agent_id = auth.uid()));

-- ============ RPCs ============

CREATE OR REPLACE FUNCTION public.sell_card(_package_id uuid)
RETURNS TABLE(sale_id uuid, transaction_no text, card_username text, card_password text,
              package_name text, network_name text, price numeric, sold_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  UPDATE public.cards SET status = 'SOLD', sold_to = v_uid, sold_at = now() WHERE id = v_card.id;
  INSERT INTO public.sales (card_id, package_id, network_id, agent_id, price, package_name, network_name, agent_username)
  VALUES (v_card.id, v_pkg.id, v_net.id, v_uid, v_pkg.price, v_pkg.name, v_net.name, v_username)
  RETURNING public.sales.id, public.sales.transaction_no INTO v_sale_id, v_tx;
  INSERT INTO public.logs (user_id, actor_username, action, entity, entity_id, metadata)
  VALUES (v_uid, v_username, 'SELL_CARD', 'sale', v_sale_id,
          jsonb_build_object('package', v_pkg.name, 'network', v_net.name, 'price', v_pkg.price));
  RETURN QUERY SELECT v_sale_id, v_tx, v_card.username, v_card.password,
                      v_pkg.name, v_net.name, v_pkg.price, now();
END; $$;
REVOKE EXECUTE ON FUNCTION public.sell_card(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sell_card(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.bulk_upload_cards(_package_id UUID, _entries JSONB)
RETURNS TABLE (inserted INT, duplicates INT, errors INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid(); v_pkg RECORD; v_entry JSONB;
  v_u TEXT; v_p TEXT; v_inserted INT := 0; v_dup INT := 0; v_err INT := 0;
BEGIN
  IF NOT public.has_role(v_uid,'admin') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO v_pkg FROM public.packages WHERE id = _package_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PACKAGE_NOT_FOUND'; END IF;
  FOR v_entry IN SELECT * FROM jsonb_array_elements(_entries) LOOP
    v_u := trim(v_entry->>'username');
    v_p := NULLIF(trim(COALESCE(v_entry->>'password','')),'');
    IF v_u IS NULL OR v_u = '' THEN v_err := v_err + 1; CONTINUE; END IF;
    BEGIN
      INSERT INTO public.cards (package_id, network_id, username, password)
      VALUES (_package_id, v_pkg.network_id, v_u, v_p);
      v_inserted := v_inserted + 1;
    EXCEPTION WHEN unique_violation THEN v_dup := v_dup + 1;
      WHEN OTHERS THEN v_err := v_err + 1;
    END;
  END LOOP;
  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'UPLOAD_CARDS', 'package', _package_id,
          jsonb_build_object('inserted', v_inserted, 'duplicates', v_dup, 'errors', v_err));
  RETURN QUERY SELECT v_inserted, v_dup, v_err;
END; $$;
REVOKE EXECUTE ON FUNCTION public.bulk_upload_cards(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_upload_cards(UUID, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_agent_active(_agent_id UUID, _active BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  UPDATE public.profiles SET is_active = _active WHERE id = _agent_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.set_agent_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_agent_active(UUID, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_stats()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v JSONB;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT jsonb_build_object(
    'total_cards', (SELECT count(*) FROM cards),
    'available', (SELECT count(*) FROM cards WHERE status='AVAILABLE'),
    'sold', (SELECT count(*) FROM cards WHERE status='SOLD'),
    'sold_value', (SELECT COALESCE(sum(price),0) FROM sales),
    'available_value', (SELECT COALESCE(sum(p.price),0) FROM cards c JOIN packages p ON p.id=c.package_id WHERE c.status='AVAILABLE'),
    'networks', (SELECT count(*) FROM networks),
    'packages', (SELECT count(*) FROM packages),
    'agents', (SELECT count(*) FROM user_roles WHERE role='agent')
  ) INTO v;
  RETURN v;
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.request_cards(
  _package_id uuid, _quantity integer, _notes text DEFAULT NULL::text, _payment_method text DEFAULT 'CREDIT'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_uid uuid := auth.uid(); v_username text; v_pkg record; v_net record; v_id uuid; v_pm text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.is_active_user(v_uid) THEN RAISE EXCEPTION 'ACCOUNT_INACTIVE'; END IF;
  IF NOT public.has_role(v_uid,'agent') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 OR _quantity > 10000 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
  v_pm := UPPER(COALESCE(_payment_method,'CREDIT'));
  IF v_pm NOT IN ('CASH','CREDIT') THEN v_pm := 'CREDIT'; END IF;
  SELECT username INTO v_username FROM public.profiles WHERE id = v_uid;
  SELECT * INTO v_pkg FROM public.packages WHERE id = _package_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'PACKAGE_NOT_FOUND'; END IF;
  SELECT * INTO v_net FROM public.networks WHERE id = v_pkg.network_id;
  INSERT INTO public.card_requests (agent_id, agent_username, package_id, network_id, package_name, network_name,
    quantity, notes, payment_method, unit_price, total_value)
  VALUES (v_uid, v_username, v_pkg.id, v_net.id, v_pkg.name, v_net.name, _quantity, NULLIF(trim(_notes),''),
    v_pm, v_pkg.price, v_pkg.price * _quantity)
  RETURNING id INTO v_id;
  INSERT INTO public.logs (user_id, actor_username, action, entity, entity_id, metadata)
  VALUES (v_uid, v_username, 'REQUEST_CARDS', 'card_request', v_id,
          jsonb_build_object('package', v_pkg.name, 'quantity', _quantity, 'payment_method', v_pm));
  RETURN v_id;
END; $function$;
REVOKE EXECUTE ON FUNCTION public.request_cards(uuid, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_cards(uuid, integer, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_card_request(_request_id uuid)
RETURNS TABLE(approved integer, remaining integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_uid uuid := auth.uid(); v_req record; v_moved int;
BEGIN
  IF NOT public.has_role(v_uid,'admin') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO v_req FROM public.card_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
  IF v_req.status <> 'PENDING' THEN RAISE EXCEPTION 'ALREADY_DECIDED'; END IF;
  WITH picked AS (
    SELECT id FROM public.cards
      WHERE package_id = v_req.package_id AND status = 'AVAILABLE'
      ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT v_req.quantity
  ), upd AS (
    UPDATE public.cards c SET status = 'ASSIGNED', assigned_to = v_req.agent_id, assigned_at = now()
      FROM picked WHERE c.id = picked.id RETURNING c.id
  ) SELECT count(*)::int INTO v_moved FROM upd;
  UPDATE public.card_requests
    SET status = 'APPROVED', approved_quantity = v_moved, decided_by = v_uid, decided_at = now(),
        total_value = COALESCE(unit_price,0) * v_moved
    WHERE id = _request_id;
  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'APPROVE_REQUEST', 'card_request', _request_id,
          jsonb_build_object('requested', v_req.quantity, 'approved', v_moved,
                             'agent', v_req.agent_username, 'package', v_req.package_name));
  RETURN QUERY SELECT v_moved, GREATEST(v_req.quantity - v_moved, 0);
END; $function$;
REVOKE EXECUTE ON FUNCTION public.approve_card_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_card_request(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_card_request(_request_id uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_req record;
BEGIN
  IF NOT public.has_role(v_uid,'admin') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO v_req FROM public.card_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
  IF v_req.status <> 'PENDING' THEN RAISE EXCEPTION 'ALREADY_DECIDED'; END IF;
  UPDATE public.card_requests
    SET status = 'REJECTED', reject_reason = NULLIF(trim(_reason),''),
        decided_by = v_uid, decided_at = now()
    WHERE id = _request_id;
  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'REJECT_REQUEST', 'card_request', _request_id,
          jsonb_build_object('agent', v_req.agent_username, 'package', v_req.package_name, 'reason', _reason));
END; $$;
REVOKE EXECUTE ON FUNCTION public.reject_card_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_card_request(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.agent_cabin()
RETURNS TABLE(
  package_id uuid, package_name text, network_id uuid, network_name text,
  price numeric, color text, data_size text, speed text, validity text,
  currency text, available int, sold_count int
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  RETURN QUERY
    WITH mine AS (
      SELECT c.package_id,
             count(*) FILTER (WHERE c.status = 'ASSIGNED') AS avail,
             count(*) FILTER (WHERE c.status = 'SOLD') AS sold
      FROM public.cards c
      WHERE (c.assigned_to = v_uid AND c.status = 'ASSIGNED')
         OR (c.sold_to = v_uid AND c.status = 'SOLD')
      GROUP BY c.package_id
    )
    SELECT p.id, p.name, n.id, n.name, p.price, p.color, p.data_size, p.speed, p.validity,
           n.currency, COALESCE(m.avail,0)::int, COALESCE(m.sold,0)::int
    FROM mine m
    JOIN public.packages p ON p.id = m.package_id
    JOIN public.networks n ON n.id = p.network_id
    ORDER BY n.name, p.sort_order, p.name;
END; $$;
REVOKE EXECUTE ON FUNCTION public.agent_cabin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_cabin() TO authenticated;

CREATE OR REPLACE FUNCTION public.package_counts(_network_id uuid)
RETURNS TABLE(package_id uuid, available integer, assigned integer, sold integer, my_assigned integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
END; $$;
REVOKE EXECUTE ON FUNCTION public.package_counts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.package_counts(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_cards(
  _network_id uuid, _package_id uuid DEFAULT NULL, _agent_id uuid DEFAULT NULL,
  _search text DEFAULT NULL, _limit int DEFAULT 500
) RETURNS TABLE (
  id uuid, username text, password text, status text,
  package_id uuid, package_name text,
  assigned_to uuid, assigned_username text,
  sold_to uuid, sold_username text,
  created_at timestamptz, assigned_at timestamptz, sold_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_q text;
BEGIN
  IF NOT public.has_role(v_uid,'admin') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  v_q := NULLIF(trim(COALESCE(_search,'')),'');
  RETURN QUERY
    SELECT c.id, c.username, c.password, c.status::text,
           c.package_id, p.name, c.assigned_to, pa.username,
           c.sold_to, ps.username, c.created_at, c.assigned_at, c.sold_at
    FROM public.cards c
    JOIN public.packages p ON p.id = c.package_id
    LEFT JOIN public.profiles pa ON pa.id = c.assigned_to
    LEFT JOIN public.profiles ps ON ps.id = c.sold_to
    WHERE c.network_id = _network_id
      AND (_package_id IS NULL OR c.package_id = _package_id)
      AND (_agent_id IS NULL OR c.assigned_to = _agent_id OR c.sold_to = _agent_id)
      AND (v_q IS NULL OR c.username ILIKE '%'||v_q||'%' OR COALESCE(c.password,'') ILIKE '%'||v_q||'%')
    ORDER BY c.created_at DESC
    LIMIT GREATEST(1, LEAST(_limit, 2000));
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_list_cards(uuid, uuid, uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_cards(uuid, uuid, uuid, text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_cards(_ids uuid[])
RETURNS TABLE (deleted int, skipped_sold int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_del int; v_sold int;
BEGIN
  IF NOT public.has_role(v_uid,'admin') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _ids IS NULL OR array_length(_ids,1) IS NULL THEN
    RETURN QUERY SELECT 0, 0; RETURN;
  END IF;
  SELECT count(*)::int INTO v_sold FROM public.cards WHERE id = ANY(_ids) AND status = 'SOLD';
  WITH d AS (
    DELETE FROM public.cards WHERE id = ANY(_ids) AND status <> 'SOLD' RETURNING id
  ) SELECT count(*)::int INTO v_del FROM d;
  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'BULK_DELETE_CARDS', 'cards', NULL,
          jsonb_build_object('deleted', v_del, 'skipped_sold', v_sold));
  RETURN QUERY SELECT v_del, v_sold;
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_delete_cards(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_cards(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_network(_network_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public.has_role(v_uid,'admin') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  DELETE FROM public.networks WHERE id = _network_id;
  INSERT INTO public.logs (user_id, action, entity, entity_id)
  VALUES (v_uid, 'DELETE_NETWORK', 'network', _network_id);
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_delete_network(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_network(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_package(_package_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public.has_role(v_uid,'admin') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  DELETE FROM public.packages WHERE id = _package_id;
  INSERT INTO public.logs (user_id, action, entity, entity_id)
  VALUES (v_uid, 'DELETE_PACKAGE', 'package', _package_id);
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_delete_package(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_package(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_wipe_database()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_admin_ids uuid[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_role(v_uid,'admin') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT COALESCE(array_agg(user_id), ARRAY[]::uuid[]) INTO v_admin_ids
  FROM public.user_roles WHERE role = 'admin';
  TRUNCATE TABLE
    public.logs, public.sales, public.card_requests,
    public.cards, public.packages, public.networks
  RESTART IDENTITY CASCADE;
  DELETE FROM public.user_roles WHERE role <> 'admin';
  DELETE FROM public.profiles WHERE id <> ALL (v_admin_ids);
  DELETE FROM auth.users WHERE id <> ALL (v_admin_ids);
  INSERT INTO public.logs (user_id, action, entity, metadata)
  VALUES (v_uid, 'WIPE_DATABASE', 'system',
          jsonb_build_object('admin_ids', to_jsonb(v_admin_ids), 'at', now()));
  RETURN jsonb_build_object('ok', true, 'kept_admins', to_jsonb(v_admin_ids));
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_wipe_database() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_wipe_database() TO authenticated;

CREATE OR REPLACE FUNCTION public.record_request_payment(_request_id uuid, _amount numeric, _note text DEFAULT NULL)
RETURNS TABLE(paid_amount numeric, remaining numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_uid uuid := auth.uid(); v_req record; v_username text; v_new_paid numeric;
BEGIN
  IF NOT public.has_role(v_uid,'admin') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  SELECT * INTO v_req FROM public.card_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
  IF v_req.status <> 'APPROVED' THEN RAISE EXCEPTION 'NOT_APPROVED'; END IF;
  v_new_paid := COALESCE(v_req.paid_amount,0) + _amount;
  IF v_new_paid > COALESCE(v_req.total_value,0) + 0.001 THEN RAISE EXCEPTION 'EXCEEDS_TOTAL'; END IF;
  SELECT username INTO v_username FROM public.profiles WHERE id = v_uid;
  INSERT INTO public.request_payments (request_id, amount, note, recorded_by, recorded_by_username)
  VALUES (_request_id, _amount, NULLIF(trim(_note),''), v_uid, v_username);
  UPDATE public.card_requests SET paid_amount = v_new_paid WHERE id = _request_id;
  INSERT INTO public.logs (user_id, actor_username, action, entity, entity_id, metadata)
  VALUES (v_uid, v_username, 'RECORD_PAYMENT', 'card_request', _request_id,
          jsonb_build_object('amount', _amount, 'agent', v_req.agent_username));
  RETURN QUERY SELECT v_new_paid, GREATEST(COALESCE(v_req.total_value,0) - v_new_paid, 0);
END; $function$;
GRANT EXECUTE ON FUNCTION public.record_request_payment(uuid, numeric, text) TO authenticated;

-- Phone-based login RPC
CREATE OR REPLACE FUNCTION public.username_from_phone(_phone text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT username FROM public.profiles WHERE phone = _phone LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.username_from_phone(text) TO anon, authenticated;
