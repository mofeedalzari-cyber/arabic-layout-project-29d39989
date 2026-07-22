CREATE OR REPLACE FUNCTION public.admin_unassign_cards(_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_net uuid := public.admin_network(v_uid);
  v_count int := 0;
  v_row RECORD;
  v_req RECORD;
  v_remaining numeric;
  v_reduce numeric;
BEGIN
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN RETURN 0; END IF;

  -- Snapshot before update (agent + package per card) for debt adjustment
  CREATE TEMP TABLE _unassigned_snap ON COMMIT DROP AS
  SELECT id, assigned_to AS agent_id, package_id
  FROM public.cards
  WHERE id = ANY(_ids) AND network_id = v_net AND status = 'ASSIGNED';

  WITH u AS (
    UPDATE public.cards
    SET status = 'AVAILABLE', assigned_to = NULL, assigned_at = NULL
    WHERE id = ANY(_ids) AND network_id = v_net AND status = 'ASSIGNED'
    RETURNING id
  )
  SELECT count(*)::int INTO v_count FROM u;

  -- Reduce agent debt on approved requests for each unassigned card
  FOR v_row IN SELECT agent_id, package_id FROM _unassigned_snap LOOP
    FOR v_req IN
      SELECT id, total_value, paid_amount, unit_price, approved_quantity
      FROM public.card_requests
      WHERE network_id = v_net
        AND agent_id = v_row.agent_id
        AND package_id = v_row.package_id
        AND status = 'APPROVED'
        AND COALESCE(total_value,0) - COALESCE(paid_amount,0) > 0
      ORDER BY decided_at ASC NULLS LAST, created_at ASC
      FOR UPDATE
    LOOP
      v_remaining := COALESCE(v_req.total_value,0) - COALESCE(v_req.paid_amount,0);
      v_reduce := LEAST(COALESCE(v_req.unit_price,0), v_remaining);
      IF v_reduce <= 0 THEN CONTINUE; END IF;
      UPDATE public.card_requests
      SET total_value = COALESCE(total_value,0) - v_reduce,
          approved_quantity = GREATEST(COALESCE(approved_quantity,0) - 1, 0)
      WHERE id = v_req.id;
      EXIT; -- one card handled
    END LOOP;
  END LOOP;

  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'UNASSIGN_CARDS', 'cards', NULL,
          jsonb_build_object('unassigned', v_count, 'network_id', v_net));

  RETURN v_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_unassign_cards(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_unassign_cards(uuid[]) TO authenticated;