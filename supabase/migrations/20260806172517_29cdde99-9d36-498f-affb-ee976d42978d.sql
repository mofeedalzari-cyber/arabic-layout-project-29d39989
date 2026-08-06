CREATE OR REPLACE FUNCTION public.superadmin_networks()
RETURNS TABLE(
  id uuid, name text, currency text, is_active boolean, owner_id uuid,
  owner_username text, owner_phone text,
  agents_count integer, packages_count integer, cards_count integer,
  available_count integer, assigned_count integer, sold_count integer,
  sold_value numeric, requests_value numeric, paid_value numeric, remaining_value numeric,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN QUERY
  SELECT n.id, n.name, n.currency, n.is_active, n.owner_id,
         p.username, p.phone,
         (SELECT count(*)::int FROM profiles pr JOIN user_roles ur ON ur.user_id=pr.id WHERE pr.network_id=n.id AND ur.role='agent'::app_role),
         (SELECT count(*)::int FROM packages WHERE network_id=n.id),
         (SELECT count(*)::int FROM cards WHERE network_id=n.id),
         (SELECT count(*)::int FROM cards WHERE network_id=n.id AND status='AVAILABLE'),
         (SELECT count(*)::int FROM cards WHERE network_id=n.id AND status='ASSIGNED'),
         (SELECT count(*)::int FROM cards WHERE network_id=n.id AND status='SOLD'),
         (SELECT COALESCE(sum(price),0) FROM sales WHERE network_id=n.id),
         (SELECT COALESCE(sum(total_value),0) FROM card_requests WHERE network_id=n.id AND upper(status)='APPROVED'),
         (SELECT COALESCE(sum(paid_amount),0) FROM card_requests WHERE network_id=n.id AND upper(status)='APPROVED'),
         (SELECT COALESCE(sum(GREATEST(total_value - paid_amount,0)),0) FROM card_requests WHERE network_id=n.id AND upper(status)='APPROVED'),
         n.created_at
  FROM networks n LEFT JOIN profiles p ON p.id = n.owner_id
  ORDER BY n.created_at DESC;
END; $function$;