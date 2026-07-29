ALTER TABLE public.sales ALTER COLUMN card_id DROP NOT NULL;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS card_number text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS is_external boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.record_external_sale(
  _customer_id uuid,
  _package_id uuid,
  _quantity integer,
  _card_number text,
  _unit_price numeric,
  _buyer_name text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent uuid := auth.uid();
  v_username text;
  v_network_id uuid;
  v_network_name text;
  v_package_name text;
  v_price numeric;
  v_customer_name text;
  v_qty integer := COALESCE(_quantity, 1);
  i integer;
BEGIN
  IF v_agent IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF v_qty < 1 THEN v_qty := 1; END IF;
  IF v_qty > 200 THEN RAISE EXCEPTION 'QTY_TOO_LARGE'; END IF;

  SELECT username INTO v_username FROM public.profiles WHERE id = v_agent;
  IF v_username IS NULL THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;

  SELECT p.name, p.price, p.network_id
    INTO v_package_name, v_price, v_network_id
    FROM public.packages p WHERE p.id = _package_id;
  IF v_network_id IS NULL THEN RAISE EXCEPTION 'PACKAGE_NOT_FOUND'; END IF;

  SELECT name INTO v_network_name FROM public.networks WHERE id = v_network_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.customers
     WHERE id = _customer_id AND agent_id = v_agent
  ) THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND';
  END IF;
  SELECT name INTO v_customer_name FROM public.customers WHERE id = _customer_id;

  IF _unit_price IS NULL OR _unit_price <= 0 THEN _unit_price := v_price; END IF;

  FOR i IN 1..v_qty LOOP
    INSERT INTO public.sales (
      card_id, package_id, network_id, agent_id, price,
      package_name, network_name, agent_username,
      buyer_name, customer_id, card_number, is_external
    ) VALUES (
      NULL, _package_id, v_network_id, v_agent, _unit_price,
      v_package_name, v_network_name, v_username,
      COALESCE(NULLIF(_buyer_name, ''), v_customer_name),
      _customer_id, NULLIF(_card_number, ''), true
    );
  END LOOP;

  RETURN v_qty;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_external_sale(uuid, uuid, integer, text, numeric, text) TO authenticated;