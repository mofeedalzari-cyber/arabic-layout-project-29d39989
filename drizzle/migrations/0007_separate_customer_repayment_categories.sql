ALTER TABLE public.customer_payments ADD COLUMN payment_kind text CHECK (payment_kind IN ('SALE', 'ADDED'));
COMMENT ON COLUMN public.customer_payments.payment_kind IS 'Repayment category; NULL preserves legacy unclassified entries and added-charge entries.';
CREATE OR REPLACE FUNCTION public.record_customer_repayment(_customer_id uuid, _amount numeric, _payment_kind text, _note text DEFAULT NULL)
RETURNS TABLE(customer_paid numeric, customer_balance numeric, agent_applied numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_customer public.customers%ROWTYPE;
  v_net uuid;
  v_admin boolean := false;
  v_sales numeric;
  v_charges numeric;
  v_paid numeric;
  v_category_paid numeric;
  v_balance numeric;
  v_applied numeric := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _payment_kind IS NULL OR _payment_kind NOT IN ('SALE','ADDED') THEN RAISE EXCEPTION 'INVALID_PAYMENT_KIND'; END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  SELECT * INTO v_customer FROM public.customers WHERE id = _customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_customer.agent_id <> v_uid THEN
    v_net := public.admin_network(v_uid);
    v_admin := public.has_role(v_uid, 'admin'::public.app_role) AND v_net IS NOT NULL;
    IF NOT v_admin OR NOT (COALESCE(v_customer.network_id = v_net, false) OR EXISTS (SELECT 1 FROM public.profiles WHERE id = v_customer.agent_id AND network_id = v_net)) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  END IF;
  SELECT COALESCE(SUM(price),0) INTO v_sales FROM public.sales WHERE customer_id = _customer_id;
  SELECT COALESCE(SUM(-amount) FILTER (WHERE amount < 0),0), COALESCE(SUM(amount) FILTER (WHERE amount > 0),0), COALESCE(SUM(amount) FILTER (WHERE amount > 0 AND payment_kind = _payment_kind),0)
    INTO v_charges, v_paid, v_category_paid FROM public.customer_payments WHERE customer_id = _customer_id;
  v_balance := GREATEST(v_sales + v_charges - v_paid,0);
  IF _amount > v_balance OR _amount > GREATEST((CASE WHEN _payment_kind = 'SALE' THEN v_sales ELSE v_charges END) - v_category_paid,0) THEN RAISE EXCEPTION 'PAYMENT_EXCEEDS_BALANCE'; END IF;
  INSERT INTO public.customer_payments(customer_id, agent_id, network_id, amount, note, payment_kind)
    VALUES (_customer_id, v_customer.agent_id, COALESCE(v_customer.network_id, (SELECT network_id FROM public.profiles WHERE id = v_customer.agent_id)), _amount, NULLIF(trim(_note),''), _payment_kind);
  IF v_admin AND _payment_kind = 'SALE' THEN
    SELECT sd.applied INTO v_applied FROM public.settle_agent_debt(v_customer.agent_id, _amount, COALESCE(NULLIF(trim(_note),''),'تسديد للمدير')) sd;
  END IF;
  RETURN QUERY SELECT _amount, v_balance - _amount, COALESCE(v_applied,0);
END;
$$;
REVOKE ALL ON FUNCTION public.record_customer_repayment(uuid,numeric,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_customer_repayment(uuid,numeric,text,text) TO authenticated;
