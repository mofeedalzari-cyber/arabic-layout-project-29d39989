CREATE OR REPLACE FUNCTION public.admin_delete_request_payment(_payment_id uuid)
 RETURNS TABLE(paid_amount numeric, remaining numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_net uuid := public.admin_network(auth.uid());
  v_req_id uuid;
  v_net uuid;
  v_old numeric;
  v_total numeric;
  v_paid numeric;
BEGIN
  IF v_admin_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT rp.request_id, rp.amount INTO v_req_id, v_old
  FROM public.request_payments rp WHERE rp.id = _payment_id;
  IF v_req_id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  SELECT cr.network_id, cr.total_value INTO v_net, v_total
  FROM public.card_requests cr WHERE cr.id = v_req_id;
  IF v_net <> v_admin_net THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  DELETE FROM public.request_payments WHERE id = _payment_id;

  UPDATE public.card_requests cr
    SET paid_amount = GREATEST(cr.paid_amount - v_old, 0),
        updated_at = now()
    WHERE cr.id = v_req_id
    RETURNING cr.paid_amount INTO v_paid;

  paid_amount := v_paid;
  remaining := GREATEST(v_total - v_paid, 0);
  RETURN NEXT;
END; $function$;