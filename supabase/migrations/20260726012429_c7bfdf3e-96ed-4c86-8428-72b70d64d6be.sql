
CREATE OR REPLACE FUNCTION public.superadmin_delete_network(_network_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_deleted jsonb := '{}'::jsonb;
  v_c int;
  v_agent_ids uuid[];
  v_owner_id uuid;
BEGIN
  IF NOT public.is_superadmin(v_uid) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _network_id IS NULL THEN RAISE EXCEPTION 'NETWORK_ID_REQUIRED'; END IF;

  SELECT owner_id INTO v_owner_id FROM public.networks WHERE id = _network_id;
  IF v_owner_id IS NULL AND NOT EXISTS (SELECT 1 FROM public.networks WHERE id = _network_id) THEN
    RAISE EXCEPTION 'NETWORK_NOT_FOUND';
  END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_agent_ids
  FROM public.profiles WHERE network_id = _network_id AND NOT public.is_superadmin(id);

  WITH d AS (DELETE FROM public.request_payments rp
    USING public.card_requests cr
    WHERE rp.request_id = cr.id AND cr.network_id = _network_id RETURNING rp.id)
    SELECT count(*) INTO v_c FROM d;
  v_deleted := v_deleted || jsonb_build_object('request_payments', v_c);

  DELETE FROM public.sales WHERE network_id = _network_id;
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('sales', v_c);

  DELETE FROM public.card_requests WHERE network_id = _network_id;
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('card_requests', v_c);

  DELETE FROM public.cards WHERE network_id = _network_id;
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('cards', v_c);

  DELETE FROM public.packages WHERE network_id = _network_id;
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('packages', v_c);

  DELETE FROM public.join_requests WHERE network_id = _network_id;
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('join_requests', v_c);

  DELETE FROM public.logs WHERE user_id = ANY(v_agent_ids);
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('logs', v_c);

  UPDATE public.profiles SET network_id = NULL WHERE network_id = _network_id;

  DELETE FROM public.user_roles WHERE user_id = ANY(v_agent_ids);
  DELETE FROM public.profiles WHERE id = ANY(v_agent_ids);
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('agents_deleted', v_c);

  DELETE FROM auth.users WHERE id = ANY(v_agent_ids);

  DELETE FROM public.networks WHERE id = _network_id;
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('network_deleted', v_c);

  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'SUPERADMIN_DELETE_NETWORK', 'network', _network_id, v_deleted);

  RETURN v_deleted;
END;
$function$;

REVOKE ALL ON FUNCTION public.superadmin_delete_network(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_delete_network(uuid) TO authenticated;
