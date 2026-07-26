
-- Grant superadmin role to the designated account (phone 778492884)
INSERT INTO public.user_roles (user_id, role)
VALUES ('de380cef-b6f1-4070-80d4-096d1b1f4c76'::uuid, 'superadmin'::public.app_role)
ON CONFLICT (user_id, role) DO NOTHING;

-- Helper
CREATE OR REPLACE FUNCTION public.is_superadmin(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role = 'superadmin'::public.app_role);
$$;
REVOKE EXECUTE ON FUNCTION public.is_superadmin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_superadmin(uuid) TO authenticated;

-- Global stats
CREATE OR REPLACE FUNCTION public.superadmin_stats()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT jsonb_build_object(
    'networks',      (SELECT count(*) FROM networks),
    'active_networks',(SELECT count(*) FROM networks WHERE is_active),
    'agents',        (SELECT count(*) FROM user_roles WHERE role='agent'::app_role),
    'admins',        (SELECT count(*) FROM user_roles WHERE role='admin'::app_role),
    'packages',      (SELECT count(*) FROM packages),
    'total_cards',   (SELECT count(*) FROM cards),
    'available',     (SELECT count(*) FROM cards WHERE status='AVAILABLE'),
    'assigned',      (SELECT count(*) FROM cards WHERE status='ASSIGNED'),
    'sold',          (SELECT count(*) FROM cards WHERE status='SOLD'),
    'sold_value',    (SELECT COALESCE(sum(price),0) FROM sales),
    'available_value',(SELECT COALESCE(sum(p.price),0) FROM cards c JOIN packages p ON p.id=c.package_id WHERE c.status='AVAILABLE')
  ) INTO v;
  RETURN v;
END; $$;
REVOKE EXECUTE ON FUNCTION public.superadmin_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_stats() TO authenticated;

-- Networks list (all)
CREATE OR REPLACE FUNCTION public.superadmin_networks()
RETURNS TABLE(id uuid, name text, currency text, is_active boolean, owner_id uuid, owner_username text, owner_phone text,
              agents_count int, packages_count int, cards_count int, sold_count int, sold_value numeric, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN QUERY
  SELECT n.id, n.name, n.currency, n.is_active, n.owner_id,
         p.username, p.phone,
         (SELECT count(*)::int FROM profiles pr JOIN user_roles ur ON ur.user_id=pr.id WHERE pr.network_id=n.id AND ur.role='agent'::app_role),
         (SELECT count(*)::int FROM packages WHERE network_id=n.id),
         (SELECT count(*)::int FROM cards WHERE network_id=n.id),
         (SELECT count(*)::int FROM cards WHERE network_id=n.id AND status='SOLD'),
         (SELECT COALESCE(sum(price),0) FROM sales WHERE network_id=n.id),
         n.created_at
  FROM networks n LEFT JOIN profiles p ON p.id = n.owner_id
  ORDER BY n.created_at DESC;
END; $$;
REVOKE EXECUTE ON FUNCTION public.superadmin_networks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_networks() TO authenticated;

-- Agents list (all networks)
CREATE OR REPLACE FUNCTION public.superadmin_agents()
RETURNS TABLE(id uuid, username text, full_name text, phone text, is_active boolean,
              network_id uuid, network_name text, role text,
              sold_count int, sold_value numeric, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN QUERY
  SELECT p.id, p.username, p.full_name, p.phone, p.is_active,
         p.network_id, n.name,
         COALESCE((SELECT ur.role::text FROM user_roles ur WHERE ur.user_id=p.id ORDER BY (ur.role='superadmin'::app_role) DESC, (ur.role='admin'::app_role) DESC LIMIT 1), ''),
         (SELECT count(*)::int FROM sales s WHERE s.agent_id=p.id),
         (SELECT COALESCE(sum(price),0) FROM sales s WHERE s.agent_id=p.id),
         p.created_at
  FROM profiles p LEFT JOIN networks n ON n.id = p.network_id
  WHERE NOT public.is_superadmin(p.id)
  ORDER BY p.created_at DESC;
END; $$;
REVOKE EXECUTE ON FUNCTION public.superadmin_agents() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_agents() TO authenticated;

-- Packages list (all)
CREATE OR REPLACE FUNCTION public.superadmin_packages()
RETURNS TABLE(id uuid, name text, price numeric, currency text, network_id uuid, network_name text,
              is_active boolean, available int, assigned int, sold int, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN QUERY
  SELECT p.id, p.name, p.price, n.currency, p.network_id, n.name,
         p.is_active,
         (SELECT count(*)::int FROM cards c WHERE c.package_id=p.id AND c.status='AVAILABLE'),
         (SELECT count(*)::int FROM cards c WHERE c.package_id=p.id AND c.status='ASSIGNED'),
         (SELECT count(*)::int FROM cards c WHERE c.package_id=p.id AND c.status='SOLD'),
         p.created_at
  FROM packages p JOIN networks n ON n.id = p.network_id
  ORDER BY n.name, p.price DESC;
END; $$;
REVOKE EXECUTE ON FUNCTION public.superadmin_packages() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_packages() TO authenticated;

-- Cards list (all, paginated by filter)
CREATE OR REPLACE FUNCTION public.superadmin_cards(_network_id uuid DEFAULT NULL, _package_id uuid DEFAULT NULL, _status text DEFAULT NULL, _search text DEFAULT NULL, _limit int DEFAULT 500)
RETURNS TABLE(id uuid, username text, password text, status text,
              package_id uuid, package_name text, network_id uuid, network_name text,
              assigned_to uuid, assigned_username text, sold_to uuid, sold_username text,
              created_at timestamptz, assigned_at timestamptz, sold_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_q text;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  v_q := NULLIF(trim(COALESCE(_search,'')),'');
  RETURN QUERY
  SELECT c.id, c.username, c.password, c.status::text,
         c.package_id, p.name, c.network_id, n.name,
         c.assigned_to, pa.username, c.sold_to, ps.username,
         c.created_at, c.assigned_at, c.sold_at
  FROM cards c
  JOIN packages p ON p.id = c.package_id
  JOIN networks n ON n.id = c.network_id
  LEFT JOIN profiles pa ON pa.id = c.assigned_to
  LEFT JOIN profiles ps ON ps.id = c.sold_to
  WHERE (_network_id IS NULL OR c.network_id = _network_id)
    AND (_package_id IS NULL OR c.package_id = _package_id)
    AND (_status IS NULL OR c.status::text = _status)
    AND (v_q IS NULL OR c.username ILIKE '%'||v_q||'%' OR COALESCE(c.password,'') ILIKE '%'||v_q||'%')
  ORDER BY c.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 2000));
END; $$;
REVOKE EXECUTE ON FUNCTION public.superadmin_cards(uuid, uuid, text, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_cards(uuid, uuid, text, text, int) TO authenticated;
