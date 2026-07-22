
CREATE OR REPLACE FUNCTION public.admin_unassign_cards(_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_net uuid := public.admin_network(v_uid);
  v_count int := 0;
BEGIN
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN RETURN 0; END IF;

  WITH u AS (
    UPDATE public.cards
    SET status = 'AVAILABLE', assigned_to = NULL, assigned_at = NULL
    WHERE id = ANY(_ids) AND network_id = v_net AND status = 'ASSIGNED'
    RETURNING id
  )
  SELECT count(*)::int INTO v_count FROM u;

  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'UNASSIGN_CARDS', 'cards', NULL,
          jsonb_build_object('unassigned', v_count, 'network_id', v_net));

  RETURN v_count;
END; $$;

REVOKE ALL ON FUNCTION public.admin_unassign_cards(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_unassign_cards(uuid[]) TO authenticated;
