CREATE OR REPLACE FUNCTION public.admin_reset_paid(_agent_id uuid DEFAULT NULL)
RETURNS TABLE(cleared numeric, requests_updated integer, payments_deleted integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_net uuid := public.admin_network(v_uid);
  v_username text;
  v_cleared numeric := 0;
  v_requests int := 0;
  v_payments int := 0;
BEGIN
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  IF _agent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = _agent_id AND network_id = v_net
  ) THEN
    RAISE EXCEPTION 'AGENT_NOT_IN_NETWORK';
  END IF;

  SELECT username INTO v_username FROM public.profiles WHERE id = v_uid;

  SELECT COALESCE(SUM(paid_amount),0) INTO v_cleared
  FROM public.card_requests
  WHERE network_id = v_net
    AND (_agent_id IS NULL OR agent_id = _agent_id)
    AND COALESCE(paid_amount,0) > 0;

  WITH d AS (
    DELETE FROM public.request_payments rp
    USING public.card_requests cr
    WHERE rp.request_id = cr.id
      AND cr.network_id = v_net
      AND (_agent_id IS NULL OR cr.agent_id = _agent_id)
    RETURNING rp.id
  ) SELECT count(*)::int INTO v_payments FROM d;

  WITH u AS (
    UPDATE public.card_requests
    SET paid_amount = 0
    WHERE network_id = v_net
      AND (_agent_id IS NULL OR agent_id = _agent_id)
      AND COALESCE(paid_amount,0) > 0
    RETURNING id
  ) SELECT count(*)::int INTO v_requests FROM u;

  UPDATE public.logs
  SET action = 'SETTLE_AGENT_DEBT_VOID'
  WHERE action = 'SETTLE_AGENT_DEBT'
    AND entity = 'profile'
    AND entity_id IN (
      SELECT id FROM public.profiles
      WHERE network_id = v_net AND (_agent_id IS NULL OR id = _agent_id)
    );

  INSERT INTO public.logs (user_id, actor_username, action, entity, entity_id, metadata)
  VALUES (v_uid, v_username, 'RESET_PAID',
          CASE WHEN _agent_id IS NULL THEN 'network' ELSE 'profile' END,
          COALESCE(_agent_id, v_net),
          jsonb_build_object('cleared', v_cleared,
                             'requests_updated', v_requests,
                             'payments_deleted', v_payments));

  RETURN QUERY SELECT v_cleared, v_requests, v_payments;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_reset_paid(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_paid(uuid) TO authenticated;