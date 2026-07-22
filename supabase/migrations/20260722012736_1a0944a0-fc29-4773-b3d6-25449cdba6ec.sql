CREATE OR REPLACE FUNCTION public.admin_delete_cards(_ids uuid[], _force boolean DEFAULT false)
RETURNS TABLE(deleted integer, skipped_sold integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_net uuid := public.admin_network(v_uid);
  v_del int := 0;
  v_sold int := 0;
BEGIN
  IF v_net IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  IF _force THEN
    -- Delete sales first so agent account/debt totals are recalculated immediately,
    -- even if a previous/legacy FK did not cascade as expected.
    DELETE FROM public.sales s
    USING public.cards c
    WHERE s.card_id = c.id
      AND c.id = ANY(_ids)
      AND c.network_id = v_net;

    WITH d AS (
      DELETE FROM public.cards
      WHERE id = ANY(_ids)
        AND network_id = v_net
      RETURNING id
    )
    SELECT count(*)::int INTO v_del FROM d;

    v_sold := 0;
  ELSE
    SELECT count(*)::int INTO v_sold
    FROM public.cards
    WHERE id = ANY(_ids)
      AND status = 'SOLD'
      AND network_id = v_net;

    WITH d AS (
      DELETE FROM public.cards
      WHERE id = ANY(_ids)
        AND status <> 'SOLD'
        AND network_id = v_net
      RETURNING id
    )
    SELECT count(*)::int INTO v_del FROM d;
  END IF;

  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (
    v_uid,
    'BULK_DELETE_CARDS',
    'cards',
    NULL,
    jsonb_build_object('deleted', v_del, 'skipped_sold', v_sold, 'network_id', v_net, 'force', _force)
  );

  RETURN QUERY SELECT v_del, v_sold;
END;
$function$;