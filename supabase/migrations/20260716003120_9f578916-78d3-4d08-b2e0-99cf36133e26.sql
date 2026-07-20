
-- 1) profiles.phone
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;

-- 2) card_requests extras
ALTER TABLE public.card_requests
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'CREDIT' CHECK (payment_method IN ('CASH','CREDIT')),
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

-- 3) request_payments
CREATE TABLE IF NOT EXISTS public.request_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
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

DROP POLICY IF EXISTS "admins read payments" ON public.request_payments;
CREATE POLICY "admins read payments" ON public.request_payments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "agents read own payments" ON public.request_payments;
CREATE POLICY "agents read own payments" ON public.request_payments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.card_requests r WHERE r.id = request_id AND r.agent_id = auth.uid()));

-- 4) request_cards: accept payment_method, snapshot unit_price + total_value
CREATE OR REPLACE FUNCTION public.request_cards(
  _package_id uuid, _quantity integer, _notes text DEFAULT NULL::text, _payment_method text DEFAULT 'CREDIT'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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

-- 5) approve_card_request: recalc total_value from approved_quantity
CREATE OR REPLACE FUNCTION public.approve_card_request(_request_id uuid)
 RETURNS TABLE(approved integer, remaining integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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

-- 6) record_request_payment
CREATE OR REPLACE FUNCTION public.record_request_payment(_request_id uuid, _amount numeric, _note text DEFAULT NULL)
 RETURNS TABLE(paid_amount numeric, remaining numeric)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
