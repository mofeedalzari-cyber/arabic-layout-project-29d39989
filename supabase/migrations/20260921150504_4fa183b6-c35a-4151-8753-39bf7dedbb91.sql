CREATE OR REPLACE FUNCTION public.admin_reverse_sale(_sale_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_net uuid := public.admin_network(v_uid);
  v_sale public.sales%ROWTYPE;
  v_card_returned boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT * INTO v_sale FROM public.sales WHERE id = _sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SALE_NOT_FOUND'; END IF;
  IF v_sale.network_id IS DISTINCT FROM v_net THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  IF v_sale.card_id IS NOT NULL THEN
    UPDATE public.cards
       SET status = CASE
                      WHEN v_sale.agent_id IS NOT NULL
                       AND EXISTS (
                         SELECT 1 FROM public.profiles p
                         WHERE p.id = v_sale.agent_id AND p.network_id = v_sale.network_id
                       )
                      THEN 'ASSIGNED'::public.card_status
                      ELSE 'AVAILABLE'::public.card_status
                    END,
           sold_to = NULL,
           sold_at = NULL,
           assigned_to = CASE
                           WHEN v_sale.agent_id IS NOT NULL
                            AND EXISTS (
                              SELECT 1 FROM public.profiles p
                              WHERE p.id = v_sale.agent_id AND p.network_id = v_sale.network_id
                            )
                           THEN v_sale.agent_id
                           ELSE NULL
                         END,
           assigned_at = CASE
                           WHEN v_sale.agent_id IS NOT NULL
                            AND EXISTS (
                              SELECT 1 FROM public.profiles p
                              WHERE p.id = v_sale.agent_id AND p.network_id = v_sale.network_id
                            )
                           THEN now()
                           ELSE NULL
                         END
     WHERE id = v_sale.card_id
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
      'card_id', v_sale.card_id,
      'card_returned', v_card_returned
    )
  );

  RETURN jsonb_build_object(
    'sale_id', _sale_id,
    'card_returned', v_card_returned,
    'price', v_sale.price,
    'agent_id', v_sale.agent_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_reverse_sale(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reverse_sale(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reverse_sale(uuid) TO service_role;