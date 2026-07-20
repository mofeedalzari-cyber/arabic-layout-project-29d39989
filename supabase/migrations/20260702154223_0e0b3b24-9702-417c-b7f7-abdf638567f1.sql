
-- ROLES
CREATE TYPE public.app_role AS ENUM ('admin', 'agent');
CREATE TYPE public.card_status AS ENUM ('AVAILABLE', 'SOLD');

-- PROFILES
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

-- USER ROLES
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

-- has_role security definer
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_active_user(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_active FROM public.profiles WHERE id = _user_id), false);
$$;

-- profiles policies
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin insert profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete profile" ON public.profiles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- user_roles policies
CREATE POLICY "read own roles or admin" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Auto-create profile + agent role on signup (username stored in raw_user_meta_data.username)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_username TEXT;
  v_is_first BOOLEAN;
BEGIN
  v_username := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));
  SELECT NOT EXISTS(SELECT 1 FROM public.profiles) INTO v_is_first;
  INSERT INTO public.profiles (id, username, full_name, is_active)
  VALUES (NEW.id, v_username, NEW.raw_user_meta_data->>'full_name', v_is_first);
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN v_is_first THEN 'admin'::app_role ELSE 'agent'::app_role END);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Timestamps helper
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- NETWORKS
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
  created_by UUID REFERENCES auth.users(id),
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

-- PACKAGES
CREATE TABLE public.packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id UUID NOT NULL REFERENCES public.networks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  data_size TEXT,
  speed TEXT,
  validity TEXT,
  description TEXT,
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

-- CARDS
CREATE TABLE public.cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  network_id UUID NOT NULL REFERENCES public.networks(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  password TEXT,
  status card_status NOT NULL DEFAULT 'AVAILABLE',
  sold_to UUID REFERENCES auth.users(id),
  sold_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (package_id, username)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cards TO authenticated;
GRANT ALL ON public.cards TO service_role;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
-- Admin sees all; agent sees only cards they bought (never AVAILABLE cards to prevent leaking credentials)
CREATE POLICY "cards admin all" ON public.cards FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "cards agent own sold" ON public.cards FOR SELECT TO authenticated
  USING (sold_to = auth.uid());
CREATE POLICY "cards admin insert" ON public.cards FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "cards admin update" ON public.cards FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "cards admin delete" ON public.cards FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX cards_pkg_status_idx ON public.cards(package_id, status);
CREATE INDEX cards_sold_to_idx ON public.cards(sold_to);

-- SALES
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_no TEXT NOT NULL UNIQUE DEFAULT ('TX-' || to_char(now(),'YYYYMMDD') || '-' || lpad(floor(random()*100000)::text,5,'0')),
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE RESTRICT,
  package_id UUID NOT NULL REFERENCES public.packages(id),
  network_id UUID NOT NULL REFERENCES public.networks(id),
  agent_id UUID NOT NULL REFERENCES auth.users(id),
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

-- LOGS
CREATE TABLE public.logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  actor_username TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.logs TO authenticated;
GRANT ALL ON public.logs TO service_role;
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "logs admin read" ON public.logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "logs any insert self" ON public.logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE INDEX logs_created_idx ON public.logs(created_at DESC);

-- SELL FUNCTION: atomic, prevents double sell
CREATE OR REPLACE FUNCTION public.sell_card(_package_id UUID)
RETURNS TABLE (
  sale_id UUID, transaction_no TEXT, card_username TEXT, card_password TEXT,
  package_name TEXT, network_name TEXT, price NUMERIC, sold_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_username TEXT;
  v_card RECORD;
  v_pkg RECORD;
  v_net RECORD;
  v_sale_id UUID;
  v_tx TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.is_active_user(v_uid) THEN RAISE EXCEPTION 'ACCOUNT_INACTIVE'; END IF;
  IF NOT (public.has_role(v_uid,'agent') OR public.has_role(v_uid,'admin')) THEN
    RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT username INTO v_username FROM public.profiles WHERE id = v_uid;
  SELECT * INTO v_pkg FROM public.packages WHERE id = _package_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'PACKAGE_NOT_FOUND'; END IF;
  SELECT * INTO v_net FROM public.networks WHERE id = v_pkg.network_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'NETWORK_INACTIVE'; END IF;

  -- Lock first available card
  SELECT * INTO v_card FROM public.cards
    WHERE package_id = _package_id AND status = 'AVAILABLE'
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_CARDS_AVAILABLE'; END IF;

  UPDATE public.cards
    SET status = 'SOLD', sold_to = v_uid, sold_at = now()
    WHERE id = v_card.id;

  INSERT INTO public.sales (card_id, package_id, network_id, agent_id, price, package_name, network_name, agent_username)
  VALUES (v_card.id, v_pkg.id, v_net.id, v_uid, v_pkg.price, v_pkg.name, v_net.name, v_username)
  RETURNING id, transaction_no INTO v_sale_id, v_tx;

  INSERT INTO public.logs (user_id, actor_username, action, entity, entity_id, metadata)
  VALUES (v_uid, v_username, 'SELL_CARD', 'sale', v_sale_id,
          jsonb_build_object('package', v_pkg.name, 'network', v_net.name, 'price', v_pkg.price));

  RETURN QUERY SELECT v_sale_id, v_tx, v_card.username, v_card.password,
                      v_pkg.name, v_net.name, v_pkg.price, now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.sell_card(UUID) TO authenticated;

-- Bulk upload with de-dup
CREATE OR REPLACE FUNCTION public.bulk_upload_cards(_package_id UUID, _entries JSONB)
RETURNS TABLE (inserted INT, duplicates INT, errors INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_pkg RECORD;
  v_entry JSONB;
  v_u TEXT; v_p TEXT;
  v_inserted INT := 0; v_dup INT := 0; v_err INT := 0;
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
END;
$$;
GRANT EXECUTE ON FUNCTION public.bulk_upload_cards(UUID, JSONB) TO authenticated;

-- Admin: toggle agent active
CREATE OR REPLACE FUNCTION public.set_agent_active(_agent_id UUID, _active BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  UPDATE public.profiles SET is_active = _active WHERE id = _agent_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.set_agent_active(UUID, BOOLEAN) TO authenticated;

-- Dashboard stats view (admin only via RLS on sources)
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
GRANT EXECUTE ON FUNCTION public.admin_stats() TO authenticated;
