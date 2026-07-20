
-- 1) Lock down every SECURITY DEFINER function in public: revoke from PUBLIC/anon,
--    grant EXECUTE only to authenticated. Pre-login helpers are re-granted to anon after.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon',
                   r.nspname, r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated',
                   r.nspname, r.proname, r.args);
  END LOOP;
END $$;

-- Trigger-only functions must not be callable by any client
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_non_admin_activation() FROM PUBLIC, anon, authenticated;

-- Pre-login helpers legitimately need anon access
GRANT EXECUTE ON FUNCTION public.list_active_networks() TO anon;
GRANT EXECUTE ON FUNCTION public.username_from_phone(text) TO anon;

-- 2) Rotate the admin password that was previously seeded in plaintext.
--    Set to a random value so nobody can log in with the leaked one.
--    The admin must use "forgot password" (or an out-of-band reset) to set a new one.
UPDATE auth.users
   SET encrypted_password = crypt(encode(gen_random_bytes(24), 'base64'), gen_salt('bf')),
       updated_at = now()
 WHERE email = '778492884@wificards.local';
