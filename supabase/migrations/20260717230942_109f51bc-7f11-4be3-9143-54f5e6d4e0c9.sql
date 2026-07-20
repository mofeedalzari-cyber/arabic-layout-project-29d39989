
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
BEGIN
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

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

  DELETE FROM public.logs WHERE user_id IN (
    SELECT id FROM public.profiles WHERE network_id = v_net
  );
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('logs', v_c);

  UPDATE public.profiles SET network_id = NULL, is_active = false
    WHERE network_id = v_net AND id <> v_uid;
  GET DIAGNOSTICS v_c = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('agents_unlinked', v_c);

  -- Keep the network itself so the admin can continue managing it
  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'WIPE_NETWORK_DATA', 'network', v_net, v_deleted);

  RETURN v_deleted;
END; $function$;
