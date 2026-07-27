CREATE OR REPLACE FUNCTION public.delete_customer(_customer_id uuid, _delete_cards boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_net uuid := public.admin_network(v_uid);
  v_cust RECORD;
  v_card_ids uuid[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO v_cust FROM public.customers WHERE id = _customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
  IF v_cust.agent_id <> v_uid AND (v_net IS NULL OR v_cust.network_id IS DISTINCT FROM v_net) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  -- Collect all cards linked to this customer's sales, then delete sales and cards permanently
  SELECT COALESCE(array_agg(card_id), ARRAY[]::uuid[]) INTO v_card_ids
  FROM public.sales WHERE customer_id = _customer_id;

  DELETE FROM public.sales WHERE customer_id = _customer_id;

  IF array_length(v_card_ids, 1) IS NOT NULL THEN
    DELETE FROM public.cards WHERE id = ANY(v_card_ids);
  END IF;

  DELETE FROM public.customers WHERE id = _customer_id;

  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'DELETE_CUSTOMER', 'customer', _customer_id,
          jsonb_build_object('name', v_cust.name, 'cards_deleted', COALESCE(array_length(v_card_ids,1),0)));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.delete_customer(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_customer(uuid, boolean) TO service_role;