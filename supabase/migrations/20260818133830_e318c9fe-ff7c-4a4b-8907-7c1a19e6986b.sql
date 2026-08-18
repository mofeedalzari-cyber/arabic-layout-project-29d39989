CREATE OR REPLACE FUNCTION public.delete_sale(_sale_id uuid, _delete_card boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_net uuid := public.admin_network(v_uid);
  v_sale public.sales%ROWTYPE;
  v_deleted integer := 0;
  v_keep_for_customer boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  SELECT * INTO v_sale
  FROM public.sales
  WHERE id = _sale_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'SALE_NOT_FOUND'; END IF;

  IF v_sale.agent_id IS DISTINCT FROM v_uid
     AND (v_net IS NULL OR v_sale.network_id IS DISTINCT FROM v_net) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  -- Network admin deleting an agent's sale that belongs to a customer:
  -- keep the sale in the customer's account until the agent removes it.
  v_keep_for_customer := (
    v_sale.customer_id IS NOT NULL
    AND v_sale.agent_id IS NOT NULL
    AND v_sale.agent_id IS DISTINCT FROM v_uid
    AND v_net IS NOT NULL
    AND v_sale.network_id = v_net
  );

  IF v_keep_for_customer THEN
    IF _delete_card AND v_sale.card_id IS NOT NULL THEN
      UPDATE public.sales SET card_id = NULL WHERE id = _sale_id;
      DELETE FROM public.cards
      WHERE id = v_sale.card_id
        AND network_id = v_sale.network_id;
    END IF;

    INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
    VALUES (
      v_uid,
      'ADMIN_KEEP_SALE_FOR_CUSTOMER',
      'sale',
      _sale_id,
      jsonb_build_object(
        'transaction_no', v_sale.transaction_no,
        'agent_id', v_sale.agent_id,
        'customer_id', v_sale.customer_id,
        'card_deleted', _delete_card
      )
    );
    RETURN;
  END IF;

  DELETE FROM public.sales WHERE id = _sale_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 1 THEN RAISE EXCEPTION 'SALE_DELETE_FAILED'; END IF;

  IF _delete_card THEN
    DELETE FROM public.cards
    WHERE id = v_sale.card_id
      AND network_id = v_sale.network_id;
  ELSE
    UPDATE public.cards
       SET status = CASE
                      WHEN v_sale.agent_id IS NOT NULL
                       AND EXISTS (
                         SELECT 1 FROM public.profiles p
                         WHERE p.id = v_sale.agent_id
                           AND p.network_id = v_sale.network_id
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
                              WHERE p.id = v_sale.agent_id
                                AND p.network_id = v_sale.network_id
                            )
                           THEN v_sale.agent_id
                           ELSE NULL
                         END,
           assigned_at = CASE
                           WHEN v_sale.agent_id IS NOT NULL
                            AND EXISTS (
                              SELECT 1 FROM public.profiles p
                              WHERE p.id = v_sale.agent_id
                                AND p.network_id = v_sale.network_id
                            )
                           THEN now()
                           ELSE NULL
                         END
     WHERE id = v_sale.card_id
       AND network_id = v_sale.network_id;
  END IF;

  DELETE FROM public.logs
  WHERE action = 'SELL_CARD'
    AND entity = 'sale'
    AND entity_id = _sale_id;

  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (
    v_uid,
    'DELETE_SALE',
    'sale',
    _sale_id,
    jsonb_build_object(
      'transaction_no', v_sale.transaction_no,
      'package', v_sale.package_name,
      'price', v_sale.price,
      'agent_id', v_sale.agent_id,
      'customer_id', v_sale.customer_id,
      'card_id', v_sale.card_id,
      'card_deleted', _delete_card
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_sale(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_sale(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_cards(_ids uuid[], _force boolean DEFAULT false)
 RETURNS TABLE(deleted integer, skipped_sold integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_net uuid := public.admin_network(v_uid);
  v_del integer := 0;
  v_sold integer := 0;
  v_deleted_sales integer := 0;
  v_kept_sales integer := 0;
BEGIN
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  IF _force THEN
    -- Keep customer-linked sales: detach the card but preserve the record
    -- in the customer's account until the agent deletes it.
    WITH kept AS (
      UPDATE public.sales s
         SET card_id = NULL
       WHERE s.card_id = ANY(_ids)
         AND s.network_id = v_net
         AND s.customer_id IS NOT NULL
      RETURNING s.id
    )
    SELECT count(*)::integer INTO v_kept_sales FROM kept;

    WITH deleted_sales AS (
      DELETE FROM public.sales s
      USING public.cards c
      WHERE s.card_id = c.id
        AND c.id = ANY(_ids)
        AND c.network_id = v_net
        AND s.customer_id IS NULL
      RETURNING s.id
    )
    SELECT count(*)::integer INTO v_deleted_sales FROM deleted_sales;

    WITH deleted_cards AS (
      DELETE FROM public.cards c
      WHERE c.id = ANY(_ids)
        AND c.network_id = v_net
      RETURNING c.id
    )
    SELECT count(*)::integer INTO v_del FROM deleted_cards;

    v_sold := 0;
  ELSE
    SELECT count(*)::integer INTO v_sold
    FROM public.cards c
    WHERE c.id = ANY(_ids)
      AND c.status = 'SOLD'
      AND c.network_id = v_net;

    WITH deleted_cards AS (
      DELETE FROM public.cards c
      WHERE c.id = ANY(_ids)
        AND c.status <> 'SOLD'
        AND c.network_id = v_net
      RETURNING c.id
    )
    SELECT count(*)::integer INTO v_del FROM deleted_cards;
  END IF;

  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (
    v_uid,
    'BULK_DELETE_CARDS',
    'cards',
    NULL,
    jsonb_build_object(
      'deleted', v_del,
      'deleted_sales', v_deleted_sales,
      'kept_customer_sales', v_kept_sales,
      'skipped_sold', v_sold,
      'network_id', v_net,
      'force', _force
    )
  );

  RETURN QUERY SELECT v_del, v_sold;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_delete_cards(uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_cards(uuid[], boolean) TO authenticated;