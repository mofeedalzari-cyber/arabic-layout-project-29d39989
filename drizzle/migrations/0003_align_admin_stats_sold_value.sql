CREATE OR REPLACE FUNCTION public.admin_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v JSONB; v_net UUID := public.admin_network(auth.uid());
BEGIN
  IF v_net IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT jsonb_build_object(
    'total_cards',     (SELECT count(*) FROM cards WHERE network_id = v_net),
    'available',       (SELECT count(*) FROM cards WHERE network_id = v_net AND status='AVAILABLE'),
    'sold',            (SELECT count(*) FROM cards WHERE network_id = v_net AND status='SOLD'),
    'sold_value',      (SELECT COALESCE(sum(price),0) FROM sales WHERE network_id = v_net AND is_external = false AND card_id IS NOT NULL),
    'available_value', (SELECT COALESCE(sum(p.price),0) FROM cards c JOIN packages p ON p.id=c.package_id
                        WHERE c.network_id = v_net AND c.status='AVAILABLE'),
    'networks',        1,
    'packages',        (SELECT count(*) FROM packages WHERE network_id = v_net),
    'agents',          (SELECT count(*) FROM profiles pr JOIN user_roles ur ON ur.user_id = pr.id
                        WHERE pr.network_id = v_net AND ur.role='agent')
  ) INTO v;
  RETURN v;
END; $function$;