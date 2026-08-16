CREATE OR REPLACE FUNCTION public.restore_wipe_my_network()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _net uuid := public.my_owned_network_id();
BEGIN
  IF _net IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  DELETE FROM public.request_payments rp
   WHERE rp.request_id IN (SELECT id FROM public.card_requests WHERE network_id = _net);
  DELETE FROM public.customer_payments cp
   WHERE cp.customer_id IN (SELECT id FROM public.customers WHERE network_id = _net);
  DELETE FROM public.sales WHERE network_id = _net;
  DELETE FROM public.card_requests WHERE network_id = _net;
  DELETE FROM public.cards WHERE network_id = _net;
  DELETE FROM public.packages WHERE network_id = _net;
  DELETE FROM public.join_requests WHERE network_id = _net;
  DELETE FROM public.customers WHERE network_id = _net;
  DELETE FROM public.mikrotiks WHERE network_id = _net;

  RETURN jsonb_build_object('ok', true, 'network_id', _net);
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_insert_rows(_table text, _rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _net uuid := public.my_owned_network_id();
  _count integer := 0;
BEGIN
  IF _net IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF _rows IS NULL OR jsonb_typeof(_rows) <> 'array' OR jsonb_array_length(_rows) = 0 THEN
    RETURN 0;
  END IF;

  IF _table = 'packages' THEN
    INSERT INTO public.packages
    SELECT * FROM jsonb_populate_recordset(null::public.packages,
      (SELECT jsonb_agg(r || jsonb_build_object('network_id', _net)) FROM jsonb_array_elements(_rows) r));
  ELSIF _table = 'cards' THEN
    INSERT INTO public.cards
    SELECT * FROM jsonb_populate_recordset(null::public.cards,
      (SELECT jsonb_agg(r || jsonb_build_object('network_id', _net)) FROM jsonb_array_elements(_rows) r));
  ELSIF _table = 'card_requests' THEN
    INSERT INTO public.card_requests
    SELECT * FROM jsonb_populate_recordset(null::public.card_requests,
      (SELECT jsonb_agg(r || jsonb_build_object('network_id', _net)) FROM jsonb_array_elements(_rows) r));
  ELSIF _table = 'sales' THEN
    INSERT INTO public.sales
    SELECT * FROM jsonb_populate_recordset(null::public.sales,
      (SELECT jsonb_agg(r || jsonb_build_object('network_id', _net)) FROM jsonb_array_elements(_rows) r));
  ELSIF _table = 'join_requests' THEN
    INSERT INTO public.join_requests
    SELECT * FROM jsonb_populate_recordset(null::public.join_requests,
      (SELECT jsonb_agg(r || jsonb_build_object('network_id', _net)) FROM jsonb_array_elements(_rows) r));
  ELSIF _table = 'customers' THEN
    INSERT INTO public.customers
    SELECT * FROM jsonb_populate_recordset(null::public.customers,
      (SELECT jsonb_agg(r || jsonb_build_object('network_id', _net)) FROM jsonb_array_elements(_rows) r));
  ELSIF _table = 'mikrotiks' THEN
    INSERT INTO public.mikrotiks
    SELECT * FROM jsonb_populate_recordset(null::public.mikrotiks,
      (SELECT jsonb_agg(r || jsonb_build_object('network_id', _net)) FROM jsonb_array_elements(_rows) r));
  ELSIF _table = 'request_payments' THEN
    INSERT INTO public.request_payments
    SELECT * FROM jsonb_populate_recordset(null::public.request_payments, _rows) x
     WHERE x.request_id IN (SELECT id FROM public.card_requests WHERE network_id = _net);
  ELSIF _table = 'customer_payments' THEN
    INSERT INTO public.customer_payments
    SELECT * FROM jsonb_populate_recordset(null::public.customer_payments, _rows) x
     WHERE x.customer_id IN (SELECT id FROM public.customers WHERE network_id = _net);
  ELSE
    RAISE EXCEPTION 'TABLE_NOT_ALLOWED';
  END IF;

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;