CREATE OR REPLACE FUNCTION public.admin_wipe_database()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_net uuid := public.admin_network(v_uid);
  v_deleted jsonb := '{}'::jsonb;
  v_c int;
  v_agent_ids uuid[];
BEGIN
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_agent_ids
  FROM public.profiles WHERE network_id = v_net AND id <> v_uid;

  WITH d AS (DELETE FROM public.request_payments rp
    USING public.card_requests cr
    WHERE rp.request_id = cr.id AND cr.network_id = v_net RETURNING rp.id)
    SELECT count(*) INTO v_c FROM d;
  v_deleted := v_deleted || jsonb_build_object('request_payments', v_c);

  DELETE FROM public.sales WHERE network_id = v_net;
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('sales', v_c);

  DELETE FROM public.card_requests WHERE network_id = v_net;
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('card_requests', v_c);

  DELETE FROM public.cards WHERE network_id = v_net;
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('cards', v_c);

  DELETE FROM public.packages WHERE network_id = v_net;
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('packages', v_c);

  DELETE FROM public.join_requests WHERE network_id = v_net;
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('join_requests', v_c);

  DELETE FROM public.logs WHERE user_id = ANY(v_agent_ids);
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('logs', v_c);

  -- Detach agents from the network so we can delete the network row
  UPDATE public.profiles SET network_id = NULL WHERE id = ANY(v_agent_ids);

  DELETE FROM public.user_roles WHERE user_id = ANY(v_agent_ids);
  DELETE FROM public.profiles WHERE id = ANY(v_agent_ids);
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('agents_deleted', v_c);

  DELETE FROM auth.users WHERE id = ANY(v_agent_ids);

  -- Detach admin from network then delete the network itself
  UPDATE public.profiles SET network_id = NULL WHERE id = v_uid;
  DELETE FROM public.networks WHERE id = v_net;
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('network_deleted', v_c);

  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'WIPE_NETWORK', 'network', v_net, v_deleted);

  RETURN v_deleted;
END; $function$;