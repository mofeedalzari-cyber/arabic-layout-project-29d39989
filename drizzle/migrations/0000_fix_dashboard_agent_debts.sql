CREATE OR REPLACE FUNCTION public.dashboard_breakdown()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_net uuid := public.admin_network(auth.uid());
  v_res jsonb;
BEGIN
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT jsonb_build_object(
    'currency', (SELECT currency FROM networks WHERE id = v_net),
    'network_name', (SELECT name FROM networks WHERE id = v_net),
    'packages', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x->>'sold')::int DESC) FROM (
        SELECT jsonb_build_object(
          'package_id', p.id,
          'pkg', p.name,
          'price', p.price,
          'total', COALESCE(cc.total, 0),
          'sold', COALESCE(cc.sold, 0),
          'withdrawn', COALESCE(cc.withdrawn, 0),
          'remaining', COALESCE(cc.remaining, 0),
          'value', COALESCE(sv.value, 0)
        ) AS x
        FROM packages p
        LEFT JOIN (
          SELECT package_id,
                 count(*) AS total,
                 count(*) FILTER (WHERE status = 'SOLD') AS sold,
                 count(*) FILTER (WHERE status = 'ASSIGNED') AS withdrawn,
                 count(*) FILTER (WHERE status = 'AVAILABLE') AS remaining
          FROM cards WHERE network_id = v_net GROUP BY package_id
        ) cc ON cc.package_id = p.id
        LEFT JOIN (
          SELECT package_id, SUM(price) AS value
          FROM sales
          WHERE network_id = v_net AND is_external = false AND card_id IS NOT NULL
          GROUP BY package_id
        ) sv ON sv.package_id = p.id
        WHERE p.network_id = v_net
      ) s
    ), '[]'::jsonb),
    'agent_holdings', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'agent_id', t.assigned_to,
        'agent', COALESCE(NULLIF(btrim(pr.full_name), ''), pr.username),
        'phone', COALESCE(pr.phone, pr.username),
        'pkg', pk.name,
        'price', pk.price,
        'holding', t.holding
      ))
      FROM (
        SELECT assigned_to, package_id, count(*)::int AS holding
        FROM cards
        WHERE network_id = v_net AND status = 'ASSIGNED' AND assigned_to IS NOT NULL
        GROUP BY assigned_to, package_id
      ) t
      LEFT JOIN profiles pr ON pr.id = t.assigned_to
      LEFT JOIN packages pk ON pk.id = t.package_id
    ), '[]'::jsonb),
    'agents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pr.id, 'username', pr.username, 'full_name', pr.full_name,
        'phone', pr.phone, 'is_active', pr.is_active
      ) ORDER BY pr.full_name)
      FROM profiles pr
      JOIN user_roles ur ON ur.user_id = pr.id AND ur.role = 'agent'
      WHERE pr.network_id = v_net
    ), '[]'::jsonb),
    'summary', jsonb_build_object(
      'total', (SELECT count(*) FROM cards WHERE network_id = v_net),
      'sold', (SELECT count(*) FROM cards WHERE network_id = v_net AND status = 'SOLD'),
      'remaining', (SELECT count(*) FROM cards WHERE network_id = v_net AND status = 'AVAILABLE'),
      'salesValue', (SELECT COALESCE(SUM(price), 0) FROM sales WHERE network_id = v_net AND is_external = false AND card_id IS NOT NULL),
      'debts', COALESCE((
        SELECT SUM(GREATEST(t.total - t.paid, 0)) FROM (
          SELECT agent_id, SUM(total_value) AS total, SUM(paid_amount) AS paid
          FROM card_requests
          WHERE network_id = v_net AND status = 'APPROVED'
          GROUP BY agent_id
        ) t
      ), 0),
      'collected', (SELECT COALESCE(SUM(paid_amount), 0) FROM card_requests WHERE network_id = v_net AND status = 'APPROVED'),
      'settled', (SELECT COALESCE(SUM(rp.amount), 0) FROM request_payments rp JOIN card_requests cr ON cr.id = rp.request_id WHERE cr.network_id = v_net),
      'agentsCount', (SELECT count(*) FROM profiles pr JOIN user_roles ur ON ur.user_id = pr.id WHERE pr.network_id = v_net AND ur.role = 'agent')
    )
  ) INTO v_res;

  RETURN v_res;
END; $function$