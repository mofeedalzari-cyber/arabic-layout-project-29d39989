
CREATE OR REPLACE FUNCTION public.settle_agent_debt(_agent_id uuid, _amount numeric, _note text DEFAULT NULL)
RETURNS TABLE(applied numeric, remaining_debt numeric, payments_count int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_net uuid := public.admin_network(v_uid);
  v_username text;
  v_req RECORD;
  v_left numeric := COALESCE(_amount, 0);
  v_applied numeric := 0;
  v_count int := 0;
  v_alloc numeric;
  v_req_remaining numeric;
  v_total_debt numeric := 0;
BEGIN
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _agent_id AND network_id = v_net) THEN
    RAISE EXCEPTION 'AGENT_NOT_IN_NETWORK';
  END IF;

  SELECT username INTO v_username FROM public.profiles WHERE id = v_uid;

  FOR v_req IN
    SELECT id, total_value, paid_amount
    FROM public.card_requests
    WHERE agent_id = _agent_id
      AND network_id = v_net
      AND status = 'APPROVED'
      AND COALESCE(total_value,0) - COALESCE(paid_amount,0) > 0
    ORDER BY decided_at ASC NULLS LAST, created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_left <= 0;
    v_req_remaining := COALESCE(v_req.total_value,0) - COALESCE(v_req.paid_amount,0);
    v_alloc := LEAST(v_left, v_req_remaining);
    IF v_alloc <= 0 THEN CONTINUE; END IF;

    INSERT INTO public.request_payments (request_id, amount, note, recorded_by, recorded_by_username)
    VALUES (v_req.id, v_alloc, NULLIF(trim(_note),''), v_uid, v_username);

    UPDATE public.card_requests
    SET paid_amount = COALESCE(paid_amount,0) + v_alloc
    WHERE id = v_req.id;

    v_applied := v_applied + v_alloc;
    v_left := v_left - v_alloc;
    v_count := v_count + 1;
  END LOOP;

  SELECT COALESCE(SUM(COALESCE(total_value,0) - COALESCE(paid_amount,0)), 0)
  INTO v_total_debt
  FROM public.card_requests
  WHERE agent_id = _agent_id AND network_id = v_net AND status = 'APPROVED';

  INSERT INTO public.logs (user_id, actor_username, action, entity, entity_id, metadata)
  VALUES (v_uid, v_username, 'SETTLE_AGENT_DEBT', 'profile', _agent_id,
          jsonb_build_object('amount', _amount, 'applied', v_applied, 'remaining_debt', v_total_debt, 'note', _note));

  RETURN QUERY SELECT v_applied, v_total_debt, v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.settle_agent_debt(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_agent_debt(uuid, numeric, text) TO authenticated;
