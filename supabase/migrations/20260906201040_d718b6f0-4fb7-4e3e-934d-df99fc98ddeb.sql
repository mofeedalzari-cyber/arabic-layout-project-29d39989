CREATE OR REPLACE FUNCTION public.admin_transfer_customer(_customer_id uuid, _to_agent uuid)
RETURNS TABLE(moved_cards integer, moved_sales integer, amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_net uuid := public.admin_network(v_uid);
  v_actor text;
  v_to_username text;
  v_to_fullname text;
  v_from_username text;
  v_to_net uuid;
  v_cust RECORD;
  v_dup RECORD;
  v_ids uuid[];
  v_moved int := 0;
  v_amount numeric := 0;
  v_sales int := 0;
  v_pays int := 0;
  v_merged int := 0;
  v_bal numeric := 0;
  v_sales_total numeric := 0;
  v_charges numeric := 0;
  v_paid numeric := 0;
BEGIN
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _to_agent IS NULL OR _customer_id IS NULL THEN RAISE EXCEPTION 'TARGET_REQUIRED'; END IF;

  SELECT username INTO v_actor FROM public.profiles WHERE id = v_uid;

  SELECT username, full_name, network_id INTO v_to_username, v_to_fullname, v_to_net
  FROM public.profiles WHERE id = _to_agent;
  IF v_to_username IS NULL OR v_to_net IS DISTINCT FROM v_net THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT c.* INTO v_cust FROM public.customers c
  WHERE c.id = _customer_id
    AND (c.network_id = v_net
         OR c.agent_id IN (SELECT p.id FROM public.profiles p WHERE p.network_id = v_net))
  FOR UPDATE;
  IF v_cust.id IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT username INTO v_from_username FROM public.profiles WHERE id = v_cust.agent_id;

  IF v_cust.agent_id = _to_agent THEN
    RETURN QUERY SELECT 0, 0, 0::numeric; RETURN;
  END IF;

  SELECT COALESCE(SUM(s.price),0) INTO v_sales_total
  FROM public.sales s WHERE s.customer_id = _customer_id;
  SELECT COALESCE(SUM(p.amount) FILTER (WHERE p.amount > 0), 0) INTO v_paid
  FROM public.customer_payments p WHERE p.customer_id = _customer_id;
  SELECT COALESCE(SUM(-p.amount) FILTER (WHERE p.amount < 0), 0) INTO v_charges
  FROM public.customer_payments p WHERE p.customer_id = _customer_id;
  v_bal := COALESCE(v_sales_total,0) + COALESCE(v_charges,0) - COALESCE(v_paid,0);

  UPDATE public.customers
    SET agent_id = _to_agent, network_id = v_net, updated_at = now()
    WHERE id = _customer_id;

  SELECT array_agg(DISTINCT s.card_id) INTO v_ids
  FROM public.sales s
  JOIN public.cards cd ON cd.id = s.card_id
  WHERE s.customer_id = _customer_id
    AND s.network_id = v_net
    AND cd.status = 'SOLD'
    AND cd.sold_to IS DISTINCT FROM _to_agent;

  IF v_ids IS NOT NULL AND array_length(v_ids, 1) IS NOT NULL THEN
    SELECT t.moved, t.amount INTO v_moved, v_amount
    FROM public.admin_transfer_sold_cards(v_ids, _to_agent, _customer_id) t;
  END IF;

  UPDATE public.sales
    SET agent_id = _to_agent,
        agent_username = v_to_username,
        agent_full_name = COALESCE(v_to_fullname, agent_full_name)
    WHERE customer_id = _customer_id
      AND network_id = v_net
      AND agent_id IS DISTINCT FROM _to_agent;
  GET DIAGNOSTICS v_sales = ROW_COUNT;

  UPDATE public.customer_payments
    SET agent_id = _to_agent, network_id = v_net
    WHERE customer_id = _customer_id;
  GET DIAGNOSTICS v_pays = ROW_COUNT;

  FOR v_dup IN
    SELECT d.id FROM public.customers d
    WHERE d.agent_id = _to_agent
      AND d.id <> _customer_id
      AND lower(trim(d.name)) = lower(trim(v_cust.name))
      AND (regexp_replace(COALESCE(d.whatsapp,''), '\D', '', 'g')
             = regexp_replace(COALESCE(v_cust.whatsapp,''), '\D', '', 'g')
           OR NULLIF(regexp_replace(COALESCE(d.whatsapp,''), '\D', '', 'g'), '') IS NULL)
  LOOP
    UPDATE public.sales SET customer_id = _customer_id WHERE customer_id = v_dup.id;
    UPDATE public.customer_payments
      SET customer_id = _customer_id, agent_id = _to_agent, network_id = v_net
      WHERE customer_id = v_dup.id;
    DELETE FROM public.customers WHERE id = v_dup.id;
    v_merged := v_merged + 1;
  END LOOP;

  INSERT INTO public.logs (user_id, actor_username, action, entity, entity_id, metadata)
  VALUES (v_uid, v_actor, 'TRANSFER_CUSTOMER', 'customers', _customer_id,
          jsonb_build_object(
            'customer_name', v_cust.name,
            'customer_whatsapp', v_cust.whatsapp,
            'from_agent', v_cust.agent_id,
            'from_agent_username', v_from_username,
            'to_agent', _to_agent,
            'to_agent_username', v_to_username,
            'to_agent_full_name', v_to_fullname,
            'balance', COALESCE(v_bal,0),
            'sales_total', COALESCE(v_sales_total,0),
            'charges', COALESCE(v_charges,0),
            'paid', COALESCE(v_paid,0),
            'moved_sales', COALESCE(v_sales,0),
            'moved_cards', COALESCE(v_moved,0),
            'moved_payments', COALESCE(v_pays,0),
            'merged_duplicates', COALESCE(v_merged,0),
            'cards_amount', COALESCE(v_amount,0),
            'network_id', v_net,
            'transferred_at', now()
          ));

  RETURN QUERY SELECT COALESCE(v_moved,0), COALESCE(v_moved,0) + COALESCE(v_sales,0), COALESCE(v_amount,0);
END;
$$;