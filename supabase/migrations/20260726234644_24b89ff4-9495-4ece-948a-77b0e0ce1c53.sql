CREATE OR REPLACE FUNCTION public.restrict_agent_sales_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_admin_net uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN NEW; END IF;
  IF public.is_superadmin(v_uid) THEN RETURN NEW; END IF;

  v_admin_net := public.admin_network(v_uid);
  IF v_admin_net IS NOT NULL AND v_admin_net = OLD.network_id THEN
    RETURN NEW;
  END IF;

  IF NEW.id             IS DISTINCT FROM OLD.id
  OR NEW.card_id        IS DISTINCT FROM OLD.card_id
  OR NEW.package_id     IS DISTINCT FROM OLD.package_id
  OR NEW.network_id     IS DISTINCT FROM OLD.network_id
  OR NEW.agent_id       IS DISTINCT FROM OLD.agent_id
  OR NEW.price          IS DISTINCT FROM OLD.price
  OR NEW.transaction_no IS DISTINCT FROM OLD.transaction_no
  OR NEW.package_name   IS DISTINCT FROM OLD.package_name
  OR NEW.network_name   IS DISTINCT FROM OLD.network_name
  OR NEW.agent_username IS DISTINCT FROM OLD.agent_username
  OR NEW.sold_at        IS DISTINCT FROM OLD.sold_at
  THEN
    RAISE EXCEPTION 'FORBIDDEN: agents can only edit buyer_name or customer_id on their sales';
  END IF;

  RETURN NEW;
END;
$function$;