
CREATE OR REPLACE FUNCTION public.approve_card_request(_request_id uuid)
 RETURNS TABLE(approved integer, remaining integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid UUID := auth.uid(); v_net UUID := public.admin_network(v_uid);
  v_req RECORD; v_moved INT; v_total NUMERIC; v_admin_username TEXT;
BEGIN
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO v_req FROM public.card_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
  IF v_req.network_id <> v_net THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_req.status <> 'PENDING' THEN RAISE EXCEPTION 'ALREADY_DECIDED'; END IF;
  WITH picked AS (
    SELECT id FROM public.cards
      WHERE package_id = v_req.package_id AND network_id = v_net AND status='AVAILABLE'
      ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT v_req.quantity
  ), upd AS (
    UPDATE public.cards c SET status='ASSIGNED', assigned_to=v_req.agent_id, assigned_at=now()
      FROM picked WHERE c.id = picked.id RETURNING c.id
  ) SELECT count(*)::int INTO v_moved FROM upd;

  v_total := COALESCE(v_req.unit_price,0) * v_moved;

  IF UPPER(COALESCE(v_req.payment_method,'CREDIT')) = 'CASH' THEN
    -- Cash: fully paid on approval; add to admin balance via request_payments, zero debt on agent
    UPDATE public.card_requests
      SET status='APPROVED', approved_quantity=v_moved, decided_by=v_uid, decided_at=now(),
          total_value = v_total, paid_amount = v_total
      WHERE id = _request_id;

    IF v_moved > 0 AND v_total > 0 THEN
      SELECT username INTO v_admin_username FROM public.profiles WHERE id = v_uid;
      INSERT INTO public.request_payments (request_id, amount, note, recorded_by, recorded_by_username)
      VALUES (_request_id, v_total, 'دفع نقدي عند الموافقة', v_uid, v_admin_username);
    END IF;
  ELSE
    UPDATE public.card_requests
      SET status='APPROVED', approved_quantity=v_moved, decided_by=v_uid, decided_at=now(),
          total_value = v_total
      WHERE id = _request_id;
  END IF;

  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'APPROVE_REQUEST', 'card_request', _request_id,
          jsonb_build_object('requested', v_req.quantity, 'approved', v_moved,
                             'agent', v_req.agent_username, 'package', v_req.package_name,
                             'payment_method', v_req.payment_method));
  RETURN QUERY SELECT v_moved, GREATEST(v_req.quantity - v_moved, 0);
END; $function$;
