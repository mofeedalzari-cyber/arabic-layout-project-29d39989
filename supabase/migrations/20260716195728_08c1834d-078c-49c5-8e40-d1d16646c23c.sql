
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS network_id uuid REFERENCES public.networks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_network_idx ON public.profiles(network_id);

-- Networks: agents only see their own assigned network
DROP POLICY IF EXISTS "networks read active for agent, all for admin" ON public.networks;
CREATE POLICY "networks read scoped"
  ON public.networks FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      is_active
      AND public.is_active_user(auth.uid())
      AND id = (SELECT network_id FROM public.profiles WHERE id = auth.uid())
    )
  );

-- Packages: agents only see packages of their own network
DROP POLICY IF EXISTS "packages read" ON public.packages;
CREATE POLICY "packages read scoped"
  ON public.packages FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      is_active
      AND public.is_active_user(auth.uid())
      AND network_id = (SELECT network_id FROM public.profiles WHERE id = auth.uid())
    )
  );

-- Enforce network scoping inside request_cards
CREATE OR REPLACE FUNCTION public.request_cards(_package_id uuid, _quantity integer, _notes text DEFAULT NULL::text, _payment_method text DEFAULT 'CREDIT'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_username text; v_pkg record; v_net record; v_id uuid; v_pm text; v_agent_net uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.is_active_user(v_uid) THEN RAISE EXCEPTION 'ACCOUNT_INACTIVE'; END IF;
  IF NOT public.has_role(v_uid,'agent') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 OR _quantity > 10000 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
  v_pm := UPPER(COALESCE(_payment_method,'CREDIT'));
  IF v_pm NOT IN ('CASH','CREDIT') THEN v_pm := 'CREDIT'; END IF;
  SELECT username, network_id INTO v_username, v_agent_net FROM public.profiles WHERE id = v_uid;
  IF v_agent_net IS NULL THEN RAISE EXCEPTION 'AGENT_NETWORK_NOT_SET'; END IF;
  SELECT * INTO v_pkg FROM public.packages WHERE id = _package_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'PACKAGE_NOT_FOUND'; END IF;
  IF v_pkg.network_id <> v_agent_net THEN RAISE EXCEPTION 'PACKAGE_NOT_IN_YOUR_NETWORK'; END IF;
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

-- Admin: assign / change agent's network
CREATE OR REPLACE FUNCTION public.set_agent_network(_agent_id uuid, _network_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _network_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.networks WHERE id = _network_id) THEN
    RAISE EXCEPTION 'NETWORK_NOT_FOUND';
  END IF;
  UPDATE public.profiles SET network_id = _network_id WHERE id = _agent_id;
  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (auth.uid(), 'SET_AGENT_NETWORK', 'profile', _agent_id,
          jsonb_build_object('network_id', _network_id));
END; $function$;
