CREATE OR REPLACE FUNCTION public.delete_customer(_customer_id uuid, _delete_cards boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_cust RECORD;
  v_sale RECORD;
  v_is_admin boolean;
  v_admin_net uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT * INTO v_cust FROM public.customers WHERE id = _customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;

  v_is_admin := public.has_role(v_uid, 'admin'::public.app_role);
  v_admin_net := public.admin_network(v_uid);

  IF v_cust.agent_id <> v_uid AND NOT (v_is_admin AND v_admin_net IS NOT NULL AND v_admin_net = v_cust.network_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  FOR v_sale IN
    SELECT s.id AS sale_id, s.card_id, s.agent_id, s.network_id
    FROM public.sales s
    WHERE s.customer_id = _customer_id
    FOR UPDATE OF s
  LOOP
    IF _delete_cards THEN
      DELETE FROM public.cards WHERE id = v_sale.card_id;
    ELSE
      -- Always return the card to the selling agent as ASSIGNED so it shows in their cabin
      UPDATE public.cards
         SET status = 'ASSIGNED'::public.card_status,
             sold_to = NULL,
             sold_at = NULL,
             assigned_to = v_sale.agent_id,
             assigned_at = now()
       WHERE id = v_sale.card_id;
    END IF;

    DELETE FROM public.sales WHERE id = v_sale.sale_id;
  END LOOP;

  DELETE FROM public.customers WHERE id = _customer_id;
END;
$function$;