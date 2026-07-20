
-- Cards: assignment columns
ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

CREATE INDEX IF NOT EXISTS cards_assigned_to_idx ON public.cards (assigned_to, package_id) WHERE status = 'ASSIGNED';

-- Agent can read their own assigned cards
DROP POLICY IF EXISTS "cards agent own assigned" ON public.cards;
CREATE POLICY "cards agent own assigned" ON public.cards
  FOR SELECT TO authenticated
  USING (assigned_to = auth.uid());

-- ============ card_requests ============
CREATE TABLE IF NOT EXISTS public.card_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_username text NOT NULL,
  package_id uuid NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  network_id uuid NOT NULL REFERENCES public.networks(id) ON DELETE CASCADE,
  package_name text NOT NULL,
  network_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  approved_quantity integer,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  notes text,
  reject_reason text,
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.card_requests TO authenticated;
GRANT ALL ON public.card_requests TO service_role;

ALTER TABLE public.card_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cr agent own read" ON public.card_requests
  FOR SELECT TO authenticated
  USING (agent_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "cr agent insert" ON public.card_requests
  FOR INSERT TO authenticated
  WITH CHECK (agent_id = auth.uid() AND public.is_active_user(auth.uid()));

CREATE POLICY "cr admin update" ON public.card_requests
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS card_requests_status_idx ON public.card_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS card_requests_agent_idx ON public.card_requests (agent_id, created_at DESC);

CREATE TRIGGER card_requests_touch BEFORE UPDATE ON public.card_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ RPCs ============

-- Agent creates a request
CREATE OR REPLACE FUNCTION public.request_cards(_package_id uuid, _quantity int, _notes text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_username text;
  v_pkg record;
  v_net record;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.is_active_user(v_uid) THEN RAISE EXCEPTION 'ACCOUNT_INACTIVE'; END IF;
  IF NOT public.has_role(v_uid,'agent') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 OR _quantity > 10000 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;

  SELECT username INTO v_username FROM public.profiles WHERE id = v_uid;
  SELECT * INTO v_pkg FROM public.packages WHERE id = _package_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'PACKAGE_NOT_FOUND'; END IF;
  SELECT * INTO v_net FROM public.networks WHERE id = v_pkg.network_id;

  INSERT INTO public.card_requests (agent_id, agent_username, package_id, network_id, package_name, network_name, quantity, notes)
  VALUES (v_uid, v_username, v_pkg.id, v_net.id, v_pkg.name, v_net.name, _quantity, NULLIF(trim(_notes),''))
  RETURNING id INTO v_id;

  INSERT INTO public.logs (user_id, actor_username, action, entity, entity_id, metadata)
  VALUES (v_uid, v_username, 'REQUEST_CARDS', 'card_request', v_id,
          jsonb_build_object('package', v_pkg.name, 'quantity', _quantity));

  RETURN v_id;
END; $$;

-- Admin approves
CREATE OR REPLACE FUNCTION public.approve_card_request(_request_id uuid)
RETURNS TABLE(approved int, remaining int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req record;
  v_moved int;
BEGIN
  IF NOT public.has_role(v_uid,'admin') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT * INTO v_req FROM public.card_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
  IF v_req.status <> 'PENDING' THEN RAISE EXCEPTION 'ALREADY_DECIDED'; END IF;

  WITH picked AS (
    SELECT id FROM public.cards
      WHERE package_id = v_req.package_id AND status = 'AVAILABLE'
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT v_req.quantity
  ), upd AS (
    UPDATE public.cards c
      SET status = 'ASSIGNED', assigned_to = v_req.agent_id, assigned_at = now()
      FROM picked WHERE c.id = picked.id
      RETURNING c.id
  ) SELECT count(*)::int INTO v_moved FROM upd;

  UPDATE public.card_requests
    SET status = 'APPROVED', approved_quantity = v_moved, decided_by = v_uid, decided_at = now()
    WHERE id = _request_id;

  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'APPROVE_REQUEST', 'card_request', _request_id,
          jsonb_build_object('requested', v_req.quantity, 'approved', v_moved,
                             'agent', v_req.agent_username, 'package', v_req.package_name));

  RETURN QUERY SELECT v_moved, GREATEST(v_req.quantity - v_moved, 0);
END; $$;

-- Admin rejects
CREATE OR REPLACE FUNCTION public.reject_card_request(_request_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req record;
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

-- Agent's cabin summary (grouped by package)
CREATE OR REPLACE FUNCTION public.agent_cabin()
RETURNS TABLE(
  package_id uuid, package_name text, network_id uuid, network_name text,
  price numeric, color text, data_size text, speed text, validity text,
  currency text, available int, sold_count int
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

-- sell_card: sell from agent's assigned pool (admin still sells from global pool)
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

  SELECT username INTO v_username FROM public.profiles WHERE id = v_uid;
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
  RETURNING id, transaction_no INTO v_sale_id, v_tx;

  INSERT INTO public.logs (user_id, actor_username, action, entity, entity_id, metadata)
  VALUES (v_uid, v_username, 'SELL_CARD', 'sale', v_sale_id,
          jsonb_build_object('package', v_pkg.name, 'network', v_net.name, 'price', v_pkg.price));

  RETURN QUERY SELECT v_sale_id, v_tx, v_card.username, v_card.password,
                      v_pkg.name, v_net.name, v_pkg.price, now();
END; $$;
