-- Allow anon lookup of username by phone for phone-based login
create or replace function public.username_from_phone(_phone text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select username from public.profiles where phone = _phone limit 1;
$$;

grant execute on function public.username_from_phone(text) to anon, authenticated;

-- Update handle_new_user to also persist phone from signup metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_username text;
  v_is_first boolean;
BEGIN
  v_username := COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));
  SELECT NOT EXISTS(SELECT 1 FROM public.profiles) INTO v_is_first;
  INSERT INTO public.profiles (id, username, full_name, phone, is_active)
  VALUES (
    NEW.id,
    v_username,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'phone',
    v_is_first
  );
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN v_is_first THEN 'admin'::app_role ELSE 'agent'::app_role END);
  RETURN NEW;
END;
$fn$;
