-- 1) Escape LIKE wildcards coming from user search input
CREATE OR REPLACE FUNCTION public.admin_list_cards(_network_id uuid, _package_id uuid DEFAULT NULL::uuid, _agent_id uuid DEFAULT NULL::uuid, _search text DEFAULT NULL::text, _limit integer DEFAULT 500)
 RETURNS TABLE(id uuid, username text, password text, status text, package_id uuid, package_name text, assigned_to uuid, assigned_username text, sold_to uuid, sold_username text, created_at timestamp with time zone, assigned_at timestamp with time zone, sold_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_net UUID := public.admin_network(auth.uid()); v_q TEXT;
BEGIN
  IF v_net IS NULL OR _network_id <> v_net THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  v_q := NULLIF(trim(COALESCE(_search,'')),'');
  v_q := regexp_replace(v_q, '([%_\\])', '\\\1', 'g');
  RETURN QUERY
    SELECT c.id, c.username, c.password, c.status::text,
           c.package_id, p.name, c.assigned_to, pa.username,
           c.sold_to, ps.username, c.created_at, c.assigned_at, c.sold_at
    FROM public.cards c
    JOIN public.packages p ON p.id = c.package_id
    LEFT JOIN public.profiles pa ON pa.id = c.assigned_to
    LEFT JOIN public.profiles ps ON ps.id = c.sold_to
    WHERE c.network_id = v_net
      AND (_package_id IS NULL OR c.package_id = _package_id)
      AND (_agent_id  IS NULL OR c.assigned_to = _agent_id OR c.sold_to = _agent_id)
      AND (v_q IS NULL OR c.username ILIKE '%'||v_q||'%' ESCAPE '\' OR COALESCE(c.password,'') ILIKE '%'||v_q||'%' ESCAPE '\')
    ORDER BY c.created_at DESC
    LIMIT GREATEST(1, LEAST(_limit, 2000));
END; $function$;

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
  v_q := regexp_replace(v_q, '([%_\\])', '\\\1', 'g');
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
    AND (v_q IS NULL OR c.username ILIKE '%'||v_q||'%' ESCAPE '\' OR COALESCE(c.password,'') ILIKE '%'||v_q||'%' ESCAPE '\')
  ORDER BY c.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 2000));
END; $$;
REVOKE EXECUTE ON FUNCTION public.superadmin_cards(uuid, uuid, text, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_cards(uuid, uuid, text, text, int) TO authenticated;

-- 2) Server-side unique invoice numbers
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START WITH 1596 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS bigint
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT nextval('public.invoice_number_seq'); $$;

REVOKE EXECUTE ON FUNCTION public.next_invoice_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_invoice_number() TO authenticated;
GRANT USAGE ON SEQUENCE public.invoice_number_seq TO service_role;