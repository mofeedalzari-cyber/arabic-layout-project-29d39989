-- 1) Block self-assignment of network_id on INSERT (UPDATE already guarded)
CREATE OR REPLACE FUNCTION public.prevent_profile_network_self_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.id = auth.uid() AND NEW.network_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.join_requests jr
      WHERE jr.agent_id = NEW.id
        AND jr.network_id = NEW.network_id
        AND jr.status = 'APPROVED'
    ) THEN
      NEW.network_id := NULL;
    END IF;
  END IF;
  IF NEW.id = auth.uid() AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    NEW.is_active := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_network_self_insert ON public.profiles;
CREATE TRIGGER trg_prevent_profile_network_self_insert
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_network_self_insert();

-- Make sure the UPDATE guard is actually attached (one trigger pointed to the wrong function)
DROP TRIGGER IF EXISTS profiles_prevent_privilege_escalation ON public.profiles;
DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- Tighten insert policy: self rows must not carry a network, admins may only insert into their own network
DROP POLICY IF EXISTS "profiles self insert" ON public.profiles;
CREATE POLICY "profiles self insert" ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (
  (id = auth.uid() AND network_id IS NULL)
  OR (network_id IS NOT NULL AND network_id = public.admin_network(auth.uid()))
);

-- 2) user_orders: explicit write/admin policies
DROP POLICY IF EXISTS "own orders insert" ON public.user_orders;
CREATE POLICY "own orders insert" ON public.user_orders
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND status = 'PENDING');

DROP POLICY IF EXISTS "network admin orders select" ON public.user_orders;
CREATE POLICY "network admin orders select" ON public.user_orders
FOR SELECT TO authenticated
USING (network_id = public.admin_network(auth.uid()));

DROP POLICY IF EXISTS "network admin orders update" ON public.user_orders;
CREATE POLICY "network admin orders update" ON public.user_orders
FOR UPDATE TO authenticated
USING (network_id = public.admin_network(auth.uid()))
WITH CHECK (network_id = public.admin_network(auth.uid()));
