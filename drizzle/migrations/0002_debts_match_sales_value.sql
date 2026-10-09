DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.dashboard_breakdown'::regproc);
  d := replace(d, $x$(SELECT COALESCE(SUM(price),0) FROM sales WHERE network_id = v_net)
          - (SELECT$x$, $x$(SELECT COALESCE(SUM(price),0) FROM sales WHERE network_id = v_net AND is_external = false AND card_id IS NOT NULL)
          - (SELECT$x$);
  IF position('AND card_id IS NOT NULL)
          - (SELECT' in d) = 0 THEN RAISE EXCEPTION 'pattern not found'; END IF;
  EXECUTE d;
END $mig$;