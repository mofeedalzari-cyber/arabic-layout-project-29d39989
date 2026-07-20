
CREATE OR REPLACE FUNCTION public.admin_list_cards(
  _network_id uuid,
  _package_id uuid DEFAULT NULL,
  _agent_id uuid DEFAULT NULL,
  _search text DEFAULT NULL,
  _limit int DEFAULT 500
) RETURNS TABLE (
  id uuid,
  username text,
  password text,
  status text,
  package_id uuid,
  package_name text,
  assigned_to uuid,
  assigned_username text,
  sold_to uuid,
  sold_username text,
  created_at timestamptz,
  assigned_at timestamptz,
  sold_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_q text;
BEGIN
  IF NOT public.has_role(v_uid,'admin') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  v_q := NULLIF(trim(COALESCE(_search,'')),'');
  RETURN QUERY
    SELECT c.id, c.username, c.password, c.status::text,
           c.package_id, p.name,
           c.assigned_to, pa.username,
           c.sold_to, ps.username,
           c.created_at, c.assigned_at, c.sold_at
    FROM public.cards c
    JOIN public.packages p ON p.id = c.package_id
    LEFT JOIN public.profiles pa ON pa.id = c.assigned_to
    LEFT JOIN public.profiles ps ON ps.id = c.sold_to
    WHERE c.network_id = _network_id
      AND (_package_id IS NULL OR c.package_id = _package_id)
      AND (_agent_id IS NULL OR c.assigned_to = _agent_id OR c.sold_to = _agent_id)
      AND (v_q IS NULL OR c.username ILIKE '%'||v_q||'%' OR COALESCE(c.password,'') ILIKE '%'||v_q||'%')
    ORDER BY c.created_at DESC
    LIMIT GREATEST(1, LEAST(_limit, 2000));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_delete_cards(_ids uuid[])
RETURNS TABLE (deleted int, skipped_sold int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_del int; v_sold int;
BEGIN
  IF NOT public.has_role(v_uid,'admin') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _ids IS NULL OR array_length(_ids,1) IS NULL THEN
    RETURN QUERY SELECT 0, 0; RETURN;
  END IF;
  SELECT count(*)::int INTO v_sold FROM public.cards WHERE id = ANY(_ids) AND status = 'SOLD';
  WITH d AS (
    DELETE FROM public.cards WHERE id = ANY(_ids) AND status <> 'SOLD' RETURNING id
  ) SELECT count(*)::int INTO v_del FROM d;

  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'BULK_DELETE_CARDS', 'cards', NULL,
          jsonb_build_object('deleted', v_del, 'skipped_sold', v_sold));

  RETURN QUERY SELECT v_del, v_sold;
END; $$;
