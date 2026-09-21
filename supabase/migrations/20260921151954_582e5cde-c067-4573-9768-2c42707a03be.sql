CREATE OR REPLACE FUNCTION public.admin_reverse_sale(_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_net uuid := public.admin_network(v_uid);
  v_sale public.sales%ROWTYPE;
  v_card_id uuid;
  v_agent uuid;
  v_card_returned boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT * INTO v_sale FROM public.sales WHERE id = _sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SALE_NOT_FOUND'; END IF;
  IF v_sale.network_id IS DISTINCT FROM v_net THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  v_card_id := v_sale.card_id;

  IF v_card_id IS NULL AND v_sale.card_number IS NOT NULL THEN
    SELECT c.id INTO v_card_id
    FROM public.cards c
    WHERE c.network_id = v_sale.network_id
      AND c.username = v_sale.card_number
    ORDER BY (c.status = 'SOLD') DESC, c.created_at DESC
    LIMIT 1;
  END IF;

  IF v_sale.agent_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_sale.agent_id AND p.network_id = v_sale.network_id
  ) THEN
    v_agent := v_sale.agent_id;
  END IF;

  IF v_card_id IS NOT NULL THEN
    UPDATE public.cards
       SET status = CASE WHEN v_agent IS NOT NULL
                         THEN 'ASSIGNED'::public.card_status
                         ELSE 'AVAILABLE'::public.card_status END,
           sold_to = NULL,
           sold_at = NULL,
           assigned_to = v_agent,
           assigned_at = CASE WHEN v_agent IS NOT NULL THEN now() ELSE NULL END
     WHERE id = v_card_id
       AND network_id = v_sale.network_id;
    v_card_returned := true;
  END IF;

  DELETE FROM public.sales WHERE id = _sale_id;

  DELETE FROM public.logs
  WHERE action = 'SELL_CARD' AND entity = 'sale' AND entity_id = _sale_id;

  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (
    v_uid,
    'ADMIN_REVERSE_SALE',
    'sale',
    _sale_id,
    jsonb_build_object(
      'transaction_no', v_sale.transaction_no,
      'package', v_sale.package_name,
      'price', v_sale.price,
      'agent_id', v_sale.agent_id,
      'customer_id', v_sale.customer_id,
      'card_id', v_card_id,
      'card_returned', v_card_returned
    )
  );

  RETURN jsonb_build_object(
    'sale_id', _sale_id,
    'card_returned', v_card_returned,
    'returned_to_agent', v_agent,
    'price', v_sale.price,
    'agent_id', v_sale.agent_id
  );
END;
$$;