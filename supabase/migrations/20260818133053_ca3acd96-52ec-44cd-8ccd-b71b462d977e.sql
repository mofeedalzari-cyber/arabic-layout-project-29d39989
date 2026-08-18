-- List all customers in the admin's network with aggregated balances
CREATE OR REPLACE FUNCTION public.network_customers()
RETURNS TABLE(
  id uuid,
  name text,
  whatsapp text,
  created_at timestamptz,
  agent_id uuid,
  agent_username text,
  sales_total numeric,
  charges numeric,
  paid numeric,
  balance numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_net uuid := public.admin_network(v_uid);
BEGIN
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  RETURN QUERY
  WITH cust AS (
    SELECT c.id, c.name, c.whatsapp, c.created_at, c.agent_id
    FROM public.customers c
    WHERE c.network_id = v_net
       OR c.agent_id IN (SELECT p.id FROM public.profiles p WHERE p.network_id = v_net)
  ),
  s AS (
    SELECT sa.customer_id, COALESCE(SUM(sa.price),0) AS total
    FROM public.sales sa
    WHERE sa.customer_id IN (SELECT cust.id FROM cust)
    GROUP BY sa.customer_id
  ),
  pos AS (
    SELECT cp.customer_id,
           COALESCE(SUM(CASE WHEN cp.amount > 0 THEN cp.amount ELSE 0 END),0) AS paid,
           COALESCE(SUM(CASE WHEN cp.amount < 0 THEN -cp.amount ELSE 0 END),0) AS charges
    FROM public.customer_payments cp
    WHERE cp.customer_id IN (SELECT cust.id FROM cust)
    GROUP BY cp.customer_id
  )
  SELECT cust.id, cust.name, cust.whatsapp, cust.created_at, cust.agent_id,
         pr.username,
         COALESCE(s.total,0),
         COALESCE(pos.charges,0),
         COALESCE(pos.paid,0),
         GREATEST(COALESCE(s.total,0) + COALESCE(pos.charges,0) - COALESCE(pos.paid,0), 0)
  FROM cust
  LEFT JOIN public.profiles pr ON pr.id = cust.agent_id
  LEFT JOIN s ON s.customer_id = cust.id
  LEFT JOIN pos ON pos.customer_id = cust.id
  ORDER BY GREATEST(COALESCE(s.total,0) + COALESCE(pos.charges,0) - COALESCE(pos.paid,0), 0) DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.network_customers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.network_customers() TO authenticated;

-- Customer pays the network admin: reduce customer balance and settle the agent's debt
CREATE OR REPLACE FUNCTION public.admin_settle_customer_via_agent(
  _customer_id uuid,
  _amount numeric DEFAULT NULL,
  _note text DEFAULT NULL
)
RETURNS TABLE(
  customer_paid numeric,
  customer_balance numeric,
  agent_applied numeric,
  agent_remaining_debt numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_net uuid := public.admin_network(v_uid);
  v_agent uuid;
  v_bal numeric := 0;
  v_amount numeric;
  v_note text;
  v_applied numeric := 0;
  v_remaining numeric := 0;
BEGIN
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT c.agent_id INTO v_agent
  FROM public.customers c
  WHERE c.id = _customer_id
    AND (c.network_id = v_net
         OR c.agent_id IN (SELECT p.id FROM public.profiles p WHERE p.network_id = v_net));
  IF v_agent IS NULL THEN RAISE EXCEPTION 'CUSTOMER_NOT_IN_NETWORK'; END IF;

  SELECT GREATEST(
      COALESCE((SELECT SUM(sa.price) FROM public.sales sa WHERE sa.customer_id = _customer_id),0)
      + COALESCE((SELECT SUM(-cp.amount) FROM public.customer_payments cp WHERE cp.customer_id = _customer_id AND cp.amount < 0),0)
      - COALESCE((SELECT SUM(cp.amount) FROM public.customer_payments cp WHERE cp.customer_id = _customer_id AND cp.amount > 0),0)
    , 0)
  INTO v_bal;

  v_amount := LEAST(COALESCE(NULLIF(_amount, 0), v_bal), v_bal);
  IF v_amount IS NULL OR v_amount <= 0 THEN RAISE EXCEPTION 'NO_BALANCE'; END IF;

  v_note := COALESCE(NULLIF(trim(_note), ''), 'تسديد للمدير');

  INSERT INTO public.customer_payments (customer_id, agent_id, network_id, amount, note)
  VALUES (_customer_id, v_agent, v_net, v_amount, v_note);

  BEGIN
    SELECT sd.applied, sd.remaining_debt
    INTO v_applied, v_remaining
    FROM public.settle_agent_debt(v_agent, v_amount, v_note) sd;
  EXCEPTION WHEN OTHERS THEN
    v_applied := 0;
    v_remaining := 0;
  END;

  INSERT INTO public.logs (user_id, actor_username, action, entity, entity_id, metadata)
  VALUES (
    v_uid,
    (SELECT username FROM public.profiles WHERE id = v_uid),
    'CUSTOMER_SETTLE_VIA_AGENT',
    'customers',
    _customer_id,
    jsonb_build_object('amount', v_amount, 'agent_id', v_agent, 'agent_applied', COALESCE(v_applied,0))
  );

  RETURN QUERY SELECT v_amount, GREATEST(v_bal - v_amount, 0), COALESCE(v_applied,0), COALESCE(v_remaining,0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_settle_customer_via_agent(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_settle_customer_via_agent(uuid, numeric, text) TO authenticated;