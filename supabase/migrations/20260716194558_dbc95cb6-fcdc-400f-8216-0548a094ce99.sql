CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_username text;
  v_is_first boolean;
BEGIN
  v_username := COALESCE(NULLIF(NEW.raw_user_meta_data->>'username', ''), split_part(NEW.email, '@', 1));
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO v_is_first;

  INSERT INTO public.profiles (id, username, full_name, phone, is_active)
  VALUES (
    NEW.id,
    v_username,
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'phone', ''),
    v_is_first
  )
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
    updated_at = now();

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN v_is_first THEN 'admin'::public.app_role ELSE 'agent'::public.app_role END)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.username_from_phone(_phone text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT username
  FROM public.profiles
  WHERE regexp_replace(COALESCE(phone, ''), '\D', '', 'g') = regexp_replace(COALESCE(_phone, ''), '\D', '', 'g')
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.username_from_phone(text) TO anon, authenticated;

DO $$
DECLARE
  v_user record;
  v_is_first boolean;
  v_username text;
BEGIN
  FOR v_user IN
    SELECT id, email, raw_user_meta_data
    FROM auth.users
    ORDER BY created_at ASC
  LOOP
    v_username := COALESCE(NULLIF(v_user.raw_user_meta_data->>'username', ''), split_part(v_user.email, '@', 1));
    SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO v_is_first;

    INSERT INTO public.profiles (id, username, full_name, phone, is_active)
    VALUES (
      v_user.id,
      v_username,
      NULLIF(v_user.raw_user_meta_data->>'full_name', ''),
      NULLIF(v_user.raw_user_meta_data->>'phone', ''),
      v_is_first
    )
    ON CONFLICT (id) DO UPDATE SET
      username = EXCLUDED.username,
      full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
      phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
      updated_at = now();

    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user.id, CASE WHEN v_is_first THEN 'admin'::public.app_role ELSE 'agent'::public.app_role END)
    ON CONFLICT (user_id, role) DO NOTHING;
  END LOOP;
END $$;