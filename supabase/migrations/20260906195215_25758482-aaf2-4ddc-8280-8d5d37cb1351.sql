CREATE OR REPLACE FUNCTION public.admin_transfer_customer(_customer_id uuid, _to_agent uuid)
RETURNS TABLE(moved_cards integer, moved_sales integer, amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_net uuid := public.admin_network(v_uid);
  v_to_username text;
  v_to_fullname text;
  v_to_net uuid;
  v_cust RECORD;
  v_ids uuid[];
  v_moved int := 0;
  v_amount numeric := 0;
  v_sales int := 0;
BEGIN
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _to_agent IS NULL OR _customer_id IS NULL THEN RAISE EXCEPTION 'TARGET_REQUIRED'; END IF;

  SELECT username, full_name, network_id INTO v_to_username, v_to_fullname, v_to_net
  FROM public.profiles WHERE id = _to_agent;
  IF v_to_username IS NULL OR v_to_net IS DISTINCT FROM v_net THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT c.* INTO v_cust FROM public.customers c
  WHERE c.id = _customer_id
    AND (c.network_id = v_net
         OR c.agent_id IN (SELECT p.id FROM public.profiles p WHERE p.network_id = v_net))
  FOR UPDATE;
  IF v_cust.id IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  IF v_cust.agent_id = _to_agent THEN
    RETURN QUERY SELECT 0, 0, 0::numeric; RETURN;
  END IF;

  -- 1) move the customer record first so card transfer reuses it instead of duplicating
  UPDATE public.customers
    SET agent_id = _to_agent, network_id = v_net, updated_at = now()
    WHERE id = _customer_id;

  -- 2) move all sold cards linked to this customer's sales (handles agent balances)
  SELECT array_agg(DISTINCT s.card_id) INTO v_ids
  FROM public.sales s
  JOIN public.cards cd ON cd.id = s.card_id
  WHERE s.customer_id = _customer_id
    AND s.network_id = v_net
    AND cd.status = 'SOLD'
    AND cd.sold_to IS DISTINCT FROM _to_agent;

  IF v_ids IS NOT NULL AND array_length(v_ids, 1) IS NOT NULL THEN
    SELECT t.moved, t.amount INTO v_moved, v_amount
    FROM public.admin_transfer_sold_cards(v_ids, _to_agent) t;
  END IF;

  -- 3) move any remaining sales (external / cardless) of this customer
  UPDATE public.sales
    SET agent_id = _to_agent,
        agent_username = v_to_username,
        agent_full_name = COALESCE(v_to_fullname, agent_full_name)
    WHERE customer_id = _customer_id
      AND network_id = v_net
      AND agent_id IS DISTINCT FROM _to_agent;
  GET DIAGNOSTICS v_sales = ROW_COUNT;

  -- 4) move the customer's payments / charges ledger
  UPDATE public.customer_payments
    SET agent_id = _to_agent, network_id = v_net
    WHERE customer_id = _customer_id;

  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'TRANSFER_CUSTOMER', 'customers', _customer_id,
          jsonb_build_object('to_agent', _to_agent, 'from_agent', v_cust.agent_id,
                             'cards', COALESCE(v_moved,0), 'amount', COALESCE(v_amount,0),
                             'network_id', v_net));

  RETURN QUERY SELECT COALESCE(v_moved,0), COALESCE(v_moved,0) + COALESCE(v_sales,0), COALESCE(v_amount,0);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_transfer_customer(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_transfer_customer(uuid, uuid) TO authenticated;