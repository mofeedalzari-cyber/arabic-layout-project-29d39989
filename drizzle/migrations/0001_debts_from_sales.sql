DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.dashboard_breakdown'::regproc);
  d := replace(d, $x$SELECT SUM(GREATEST(t.total - t.paid, 0)) FROM (
          SELECT agent_id, SUM(total_value) AS total, SUM(paid_amount) AS paid
          FROM card_requests
          WHERE network_id = v_net AND status = 'APPROVED'
          GROUP BY agent_id
        ) t$x$, $x$SELECT GREATEST(
          (SELECT COALESCE(SUM(price),0) FROM sales WHERE network_id = v_net)
          - (SELECT COALESCE(SUM(paid_amount),0) FROM card_requests WHERE network_id = v_net AND status = 'APPROVED'), 0)$x$);
  EXECUTE d;
END $mig$;