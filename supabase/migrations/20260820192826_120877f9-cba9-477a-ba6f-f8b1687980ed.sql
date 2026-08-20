ALTER TABLE public.mikrotiks ADD COLUMN IF NOT EXISTS allow_agent_provision boolean NOT NULL DEFAULT false;
ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS hotspot_profile text;

CREATE OR REPLACE FUNCTION public.agent_hotspot_router()
RETURNS TABLE(id uuid, name text, host text, port integer, use_https boolean, username text, password text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_net uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.is_active_user(v_uid) THEN RAISE EXCEPTION 'ACCOUNT_INACTIVE'; END IF;
  SELECT p.network_id INTO v_net FROM public.profiles p WHERE p.id = v_uid;
  IF v_net IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT m.id, m.name, m.host, m.port, m.use_https, m.username, m.password
    FROM public.mikrotiks m
    WHERE m.network_id = v_net
      AND (m.allow_agent_provision = true OR public.has_role(v_uid,'admin'))
    ORDER BY m.created_at ASC
    LIMIT 1;
END; $function$;

REVOKE ALL ON FUNCTION public.agent_hotspot_router() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_hotspot_router() TO authenticated;