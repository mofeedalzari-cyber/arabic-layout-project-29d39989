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
  v_sales_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT * INTO v_cust
  FROM public.customers
  WHERE id = _customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND';
  END IF;

  IF v_cust.agent_id <> v_uid AND (v_net IS NULL OR v_cust.network_id IS DISTINCT FROM v_net) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT count(*) INTO v_sales_count
  FROM public.sales
  WHERE customer_id = _customer_id;

  -- Keep sold cards and sale records unchanged. Detach the customer account only,
  -- preserving the visible buyer name on historical sales.
  UPDATE public.sales
  SET buyer_name = COALESCE(NULLIF(trim(buyer_name), ''), v_cust.name),
      customer_id = NULL
  WHERE customer_id = _customer_id;

  DELETE FROM public.customers
  WHERE id = _customer_id;

  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (
    v_uid,
    'DELETE_CUSTOMER',
    'customer',
    _customer_id,
    jsonb_build_object(
      'name', v_cust.name,
      'sales_kept', v_sales_count,
      'cards_unchanged', true
    )
  );
END;
$function$;