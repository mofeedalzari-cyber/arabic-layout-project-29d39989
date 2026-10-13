ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS credit_limit numeric;

CREATE OR REPLACE FUNCTION public.norm_customer_name(_n text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT regexp_replace(translate(lower(trim(coalesce(_n,''))), 'إأآةى', 'اااهي'), '\s+', ' ', 'g')
$$;

CREATE OR REPLACE FUNCTION public.norm_customer_phone(_p text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT right(regexp_replace(coalesce(_p,''), '\D', '', 'g'), 9)
$$;

CREATE OR REPLACE FUNCTION public.prevent_duplicate_customer() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _net uuid; _dup record;
BEGIN
  IF TG_OP = 'UPDATE' AND norm_customer_name(NEW.name) = norm_customer_name(OLD.name)
     AND norm_customer_phone(NEW.whatsapp) = norm_customer_phone(OLD.whatsapp) THEN
    RETURN NEW;
  END IF;
  _net := coalesce(NEW.network_id, (SELECT network_id FROM profiles WHERE id = NEW.agent_id));
  IF _net IS NULL THEN RETURN NEW; END IF;
  SELECT c.name, coalesce(p.full_name, p.username) AS agent INTO _dup
  FROM customers c LEFT JOIN profiles p ON p.id = c.agent_id
  WHERE c.id <> NEW.id
    AND coalesce(c.network_id, p.network_id) = _net
    AND (norm_customer_name(c.name) = norm_customer_name(NEW.name)
         OR (length(norm_customer_phone(NEW.whatsapp)) >= 7
             AND norm_customer_phone(c.whatsapp) = norm_customer_phone(NEW.whatsapp)))
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'CUSTOMER_EXISTS: الزبون "%" مسجل مسبقًا عند المندوب %', _dup.name, coalesce(_dup.agent,'');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_customer ON public.customers;
CREATE TRIGGER trg_prevent_duplicate_customer BEFORE INSERT OR UPDATE OF name, whatsapp ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_customer();

CREATE OR REPLACE FUNCTION public.enforce_customer_credit_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _limit numeric; _bal numeric;
BEGIN
  IF NEW.customer_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.customer_id IS NOT DISTINCT FROM NEW.customer_id THEN RETURN NEW; END IF;
  SELECT credit_limit INTO _limit FROM customers WHERE id = NEW.customer_id;
  IF _limit IS NULL THEN RETURN NEW; END IF;
  SELECT coalesce((SELECT sum(price) FROM sales WHERE customer_id = NEW.customer_id AND id <> NEW.id),0)
       - coalesce((SELECT sum(amount) FROM customer_payments WHERE customer_id = NEW.customer_id),0)
    INTO _bal;
  IF _bal + NEW.price > _limit THEN
    RAISE EXCEPTION 'CREDIT_LIMIT: تجاوز سقف السحب للزبون (السقف %، الرصيد الحالي %)', _limit, _bal;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_customer_credit_limit ON public.sales;
CREATE TRIGGER trg_enforce_customer_credit_limit BEFORE INSERT OR UPDATE OF customer_id ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.enforce_customer_credit_limit();

CREATE OR REPLACE FUNCTION public.admin_set_customer_limit(_customer_id uuid, _limit numeric) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _net uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT id INTO _net FROM networks WHERE owner_id = auth.uid();
  IF NOT EXISTS (SELECT 1 FROM customers c LEFT JOIN profiles p ON p.id = c.agent_id
                 WHERE c.id = _customer_id AND coalesce(c.network_id, p.network_id) = _net) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  UPDATE customers SET credit_limit = CASE WHEN _limit IS NULL OR _limit <= 0 THEN NULL ELSE _limit END
  WHERE id = _customer_id;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_set_customer_limit(uuid, numeric) TO authenticated;