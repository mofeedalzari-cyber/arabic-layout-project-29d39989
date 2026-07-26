
CREATE OR REPLACE FUNCTION public.prevent_non_admin_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  -- Allow system context (no auth uid, e.g. signup trigger, SECURITY DEFINER RPCs) to change anything
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  -- Block self-changes to is_active unless caller is an admin
  IF NEW.is_active IS DISTINCT FROM OLD.is_active
     AND NOT public.has_role(v_uid, 'admin'::app_role)
     AND NOT public.is_superadmin(v_uid) THEN
    RAISE EXCEPTION 'FORBIDDEN: only network owners can change is_active';
  END IF;

  -- Block self-changes to network_id unless caller is an admin/superadmin
  IF NEW.network_id IS DISTINCT FROM OLD.network_id
     AND NOT public.has_role(v_uid, 'admin'::app_role)
     AND NOT public.is_superadmin(v_uid) THEN
    RAISE EXCEPTION 'FORBIDDEN: only network owners can change network_id';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS profiles_prevent_privilege_escalation ON public.profiles;
CREATE TRIGGER profiles_prevent_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_non_admin_activation();
