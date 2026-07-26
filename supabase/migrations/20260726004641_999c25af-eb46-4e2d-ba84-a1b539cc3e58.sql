
CREATE OR REPLACE FUNCTION public.superadmin_create_network(_name text, _currency text DEFAULT 'ر.س')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_name text := NULLIF(trim(_name),''); v_id uuid;
BEGIN
  IF NOT public.is_superadmin(v_uid) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_name IS NULL THEN RAISE EXCEPTION 'NETWORK_NAME_REQUIRED'; END IF;
  IF EXISTS (SELECT 1 FROM public.networks WHERE lower(name)=lower(v_name)) THEN
    RAISE EXCEPTION 'NETWORK_NAME_TAKEN';
  END IF;
  INSERT INTO public.networks (name, currency, is_active, created_by)
  VALUES (v_name, COALESCE(NULLIF(trim(_currency),''),'ر.س'), true, v_uid)
  RETURNING id INTO v_id;
  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'CREATE_NETWORK', 'network', v_id, jsonb_build_object('name', v_name));
  RETURN v_id;
END; $$;

REVOKE EXECUTE ON FUNCTION public.superadmin_create_network(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_create_network(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.superadmin_create_package(
  _network_id uuid, _name text, _price numeric,
  _data_size text DEFAULT NULL, _speed text DEFAULT NULL, _validity text DEFAULT NULL,
  _allowed_time text DEFAULT NULL, _color text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_name text := NULLIF(trim(_name),''); v_id uuid;
BEGIN
  IF NOT public.is_superadmin(v_uid) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_name IS NULL THEN RAISE EXCEPTION 'PACKAGE_NAME_REQUIRED'; END IF;
  IF _price IS NULL OR _price < 0 THEN RAISE EXCEPTION 'INVALID_PRICE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.networks WHERE id = _network_id) THEN
    RAISE EXCEPTION 'NETWORK_NOT_FOUND';
  END IF;
  INSERT INTO public.packages (network_id, name, price, data_size, speed, validity, allowed_time, color, is_active)
  VALUES (_network_id, v_name, _price,
          NULLIF(trim(_data_size),''), NULLIF(trim(_speed),''), NULLIF(trim(_validity),''),
          NULLIF(trim(_allowed_time),''), COALESCE(NULLIF(trim(_color),''),'#009688'), true)
  RETURNING id INTO v_id;
  INSERT INTO public.logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_uid, 'CREATE_PACKAGE', 'package', v_id,
          jsonb_build_object('name', v_name, 'price', _price, 'network_id', _network_id));
  RETURN v_id;
END; $$;

REVOKE EXECUTE ON FUNCTION public.superadmin_create_package(uuid, text, numeric, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_create_package(uuid, text, numeric, text, text, text, text, text) TO authenticated;
