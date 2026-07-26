CREATE OR REPLACE FUNCTION public.delete_customer(_customer_id uuid, _delete_cards boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_cust RECORD;
  v_sale RECORD;
  v_reverted int := 0;
  v_deleted int := 0;
  v_is_admin boolean;
  v_admin_net uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT * INTO v_cust FROM public.customers WHERE id = _customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;

  v_is_admin := public.has_role(v_uid, 'admin'::public.app_role);
  v_admin_net := public.admin_network(v_uid);

  -- Only the owning agent or the admin of the customer's network can delete
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
      v_deleted := v_deleted + 1;
    ELSE
      UPDATE public.cards
         SET status = CASE
                        WHEN v_sale.agent_id IS NOT NULL
                         AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_sale.agent_id AND p.network_id = v_sale.network_id)
                        THEN 'ASSIGNED'::public.card_status
                        ELSE 'AVAILABLE'::public.card_status
                      END,
             sold_to = NULL,
             sold_at = NULL,
             assigned_to = CASE
                             WHEN v_sale.agent_id IS NOT NULL
                              AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_sale.agent_id AND p.network_id = v_sale.network_id)
                             THEN v_sale.agent_id
                             ELSE NULL
                           END,
             assigned_at = CASE
                             WHEN v_sale.agent_id IS NOT NULL
                              AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_sale.agent_id AND p.network_id = v_sale.network_id)
                             THEN now()
                             ELSE NULL
                           END
       WHERE id = v_sale.card_id;
      v_reverted := v_reverted + 1;
    END IF;

    DELETE FROM public.sales WHERE id = v_sale.sale_id;
  END LOOP;

  DELETE FROM public.customers WHERE id = _customer_id;

  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'DELETE_CUSTOMER', 'customer', _customer_id,
          jsonb_build_object('name', v_cust.name,
                             'sales_deleted', v_reverted + v_deleted,
                             'cards_reverted', v_reverted,
                             'cards_deleted', v_deleted,
                             'agent_id', v_cust.agent_id,
                             'delete_cards', _delete_cards));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.delete_customer(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_customer(uuid, boolean) TO service_role;