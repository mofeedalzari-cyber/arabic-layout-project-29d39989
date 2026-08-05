ALTER TABLE public.user_orders ADD COLUMN IF NOT EXISTS receipt_path text;

CREATE POLICY "users upload own receipts" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'order-receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "users read own receipts" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'order-receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "admins read network receipts" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'order-receipts' AND EXISTS (
    SELECT 1 FROM public.user_orders o
    WHERE o.receipt_path = storage.objects.name
      AND (public.is_superadmin(auth.uid()) OR o.network_id = public.admin_network(auth.uid()))
  )
);

CREATE OR REPLACE FUNCTION public.user_request_card(_package_id uuid, _customer_name text, _note text DEFAULT NULL::text, _receipt_path text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _p record;
  _id uuid;
  _name text := nullif(btrim(coalesce(_customer_name, '')), '');
  _rp text := nullif(btrim(coalesce(_receipt_path, '')), '');
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF _name IS NULL THEN RAISE EXCEPTION 'NAME_REQUIRED'; END IF;
  IF _rp IS NULL THEN RAISE EXCEPTION 'RECEIPT_REQUIRED'; END IF;

  SELECT p.id, p.name, p.price, p.network_id, n.name AS network_name
    INTO _p
  FROM public.packages p
  JOIN public.networks n ON n.id = p.network_id
  WHERE p.id = _package_id AND p.is_active AND n.is_active;

  IF _p.id IS NULL THEN RAISE EXCEPTION 'PACKAGE_NOT_FOUND'; END IF;

  INSERT INTO public.user_orders (
    user_id, package_id, network_id, package_name, network_name, price, status, customer_name, note, receipt_path
  ) VALUES (
    _uid, _p.id, _p.network_id, _p.name, _p.network_name, _p.price, 'PENDING', _name, nullif(btrim(coalesce(_note,'')), ''), _rp
  ) RETURNING id INTO _id;

  RETURN _id;
END;
$$;

DROP FUNCTION IF EXISTS public.user_request_card(uuid, text, text);

DROP FUNCTION IF EXISTS public.admin_user_orders(text);
CREATE OR REPLACE FUNCTION public.admin_user_orders(_status text DEFAULT NULL::text)
RETURNS TABLE (
  id uuid, user_id uuid, customer_name text, username text, phone text,
  package_id uuid, package_name text, network_id uuid, network_name text,
  price numeric, status text, note text, reject_reason text,
  available int, created_at timestamptz, approved_at timestamptz, receipt_path text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.user_id, o.customer_name, pr.username, pr.phone,
         o.package_id, o.package_name, o.network_id, o.network_name,
         o.price, o.status, o.note, o.reject_reason,
         (SELECT count(*)::int FROM public.cards c WHERE c.package_id = o.package_id AND c.status = 'AVAILABLE'),
         o.created_at, o.approved_at, o.receipt_path
  FROM public.user_orders o
  LEFT JOIN public.profiles pr ON pr.id = o.user_id
  WHERE (public.is_superadmin(auth.uid()) OR o.network_id = public.admin_network(auth.uid()))
    AND (_status IS NULL OR o.status = _status)
  ORDER BY (o.status = 'PENDING') DESC, o.created_at DESC
$$;

DROP FUNCTION IF EXISTS public.my_orders();
CREATE OR REPLACE FUNCTION public.my_orders()
RETURNS TABLE (
  id uuid, package_name text, network_name text, price numeric, status text,
  customer_name text, reject_reason text, card_username text, card_password text,
  created_at timestamptz, approved_at timestamptz, receipt_path text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.package_name, o.network_name, o.price, o.status,
         o.customer_name, o.reject_reason,
         CASE WHEN o.status = 'PAID' THEN o.card_username ELSE NULL END,
         CASE WHEN o.status = 'PAID' THEN o.card_password ELSE NULL END,
         o.created_at, o.approved_at, o.receipt_path
  FROM public.user_orders o
  WHERE o.user_id = auth.uid()
  ORDER BY o.created_at DESC
$$;