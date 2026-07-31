CREATE OR REPLACE FUNCTION public.reconcile_agent_debts(_network_id uuid DEFAULT NULL)
RETURNS TABLE(created integer, total_value numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_net uuid;
  v_created integer := 0;
  v_total numeric := 0;
  r record;
BEGIN
  IF _network_id IS NOT NULL THEN
    v_net := _network_id;
    IF NOT (public.is_superadmin(auth.uid()) OR public.admin_network(auth.uid()) = v_net) THEN
      RAISE EXCEPTION 'not authorized';
    END IF;
  ELSE
    IF public.is_superadmin(auth.uid()) THEN
      v_net := NULL;
    ELSE
      v_net := public.admin_network(auth.uid());
      IF v_net IS NULL THEN RAISE EXCEPTION 'not authorized'; END IF;
    END IF;
  END IF;

  FOR r IN
    WITH held AS (
      SELECT
        COALESCE(c.assigned_to, c.sold_to) AS agent_id,
        c.package_id,
        c.network_id,
        count(*)::int AS cnt
      FROM public.cards c
      WHERE COALESCE(c.assigned_to, c.sold_to) IS NOT NULL
        AND (v_net IS NULL OR c.network_id = v_net)
      GROUP BY 1,2,3
    ), covered AS (
      SELECT cr.agent_id, cr.package_id,
             COALESCE(sum(COALESCE(cr.approved_quantity, cr.quantity)),0)::int AS cnt
      FROM public.card_requests cr
      WHERE cr.status = 'APPROVED'
      GROUP BY 1,2
    )
    SELECT h.agent_id, h.package_id, h.network_id,
           h.cnt - COALESCE(cv.cnt,0) AS missing,
           p.name AS package_name, p.price,
           n.name AS network_name,
           pr.username AS agent_username
    FROM held h
    LEFT JOIN covered cv ON cv.agent_id = h.agent_id AND cv.package_id = h.package_id
    JOIN public.packages p ON p.id = h.package_id
    JOIN public.networks n ON n.id = h.network_id
    JOIN public.profiles pr ON pr.id = h.agent_id
    WHERE h.cnt - COALESCE(cv.cnt,0) > 0
  LOOP
    INSERT INTO public.card_requests(
      agent_id, agent_username, package_id, network_id, package_name, network_name,
      quantity, approved_quantity, status, payment_method, unit_price, total_value,
      paid_amount, notes, decided_at
    ) VALUES (
      r.agent_id, r.agent_username, r.package_id, r.network_id, r.package_name, r.network_name,
      r.missing, r.missing, 'APPROVED', 'CREDIT', r.price, r.price * r.missing,
      0, 'تسوية تلقائية للكروت المخصصة بدون طلب', now()
    );
    v_created := v_created + 1;
    v_total := v_total + (r.price * r.missing);
  END LOOP;

  RETURN QUERY SELECT v_created, v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_agent_debts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_agent_debts(uuid) TO authenticated, service_role;

-- one-time backfill for existing data (runs as owner, no auth checks)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    WITH held AS (
      SELECT COALESCE(c.assigned_to, c.sold_to) AS agent_id, c.package_id, c.network_id, count(*)::int AS cnt
      FROM public.cards c WHERE COALESCE(c.assigned_to, c.sold_to) IS NOT NULL
      GROUP BY 1,2,3
    ), covered AS (
      SELECT cr.agent_id, cr.package_id, COALESCE(sum(COALESCE(cr.approved_quantity, cr.quantity)),0)::int AS cnt
      FROM public.card_requests cr WHERE cr.status='APPROVED' GROUP BY 1,2
    )
    SELECT h.agent_id, h.package_id, h.network_id, h.cnt - COALESCE(cv.cnt,0) AS missing,
           p.name AS package_name, p.price, n.name AS network_name, pr.username AS agent_username
    FROM held h
    LEFT JOIN covered cv ON cv.agent_id=h.agent_id AND cv.package_id=h.package_id
    JOIN public.packages p ON p.id=h.package_id
    JOIN public.networks n ON n.id=h.network_id
    JOIN public.profiles pr ON pr.id=h.agent_id
    WHERE h.cnt - COALESCE(cv.cnt,0) > 0
  LOOP
    INSERT INTO public.card_requests(
      agent_id, agent_username, package_id, network_id, package_name, network_name,
      quantity, approved_quantity, status, payment_method, unit_price, total_value,
      paid_amount, notes, decided_at
    ) VALUES (
      r.agent_id, r.agent_username, r.package_id, r.network_id, r.package_name, r.network_name,
      r.missing, r.missing, 'APPROVED', 'CREDIT', r.price, r.price*r.missing, 0,
      'تسوية تلقائية للكروت المخصصة بدون طلب', now()
    );
  END LOOP;
END $$;