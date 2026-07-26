CREATE OR REPLACE FUNCTION public.admin_reset_balance()
RETURNS TABLE(cleared numeric, requests_updated integer, payments_deleted integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_net uuid := public.admin_network(v_uid);
  v_cleared numeric := 0;
  v_requests int := 0;
  v_payments int := 0;
BEGIN
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT COALESCE(SUM(paid_amount),0) INTO v_cleared
  FROM public.card_requests
  WHERE network_id = v_net AND status = 'APPROVED' AND COALESCE(paid_amount,0) > 0;

  WITH d AS (
    DELETE FROM public.request_payments rp
    USING public.card_requests cr
    WHERE rp.request_id = cr.id
      AND cr.network_id = v_net
      AND cr.status = 'APPROVED'
      AND COALESCE(cr.paid_amount,0) > 0
    RETURNING rp.id
  ) SELECT count(*)::int INTO v_payments FROM d;

  WITH u AS (
    UPDATE public.card_requests
    SET total_value = GREATEST(COALESCE(total_value,0) - COALESCE(paid_amount,0), 0),
        paid_amount = 0
    WHERE network_id = v_net
      AND status = 'APPROVED'
      AND COALESCE(paid_amount,0) > 0
    RETURNING id
  ) SELECT count(*)::int INTO v_requests FROM u;

  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'RESET_BALANCE', 'network', v_net,
          jsonb_build_object('cleared', v_cleared,
                             'requests_updated', v_requests,
                             'payments_deleted', v_payments));

  RETURN QUERY SELECT v_cleared, v_requests, v_payments;
END;
$$;