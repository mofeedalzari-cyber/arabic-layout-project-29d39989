
-- Fix sales admin update policy: scope to authenticated
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='sales' AND cmd='UPDATE' AND 'public' = ANY(roles)
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.sales TO authenticated', r.policyname);
  END LOOP;
END $$;

-- Fix profiles update policy: scope to authenticated
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND cmd='UPDATE' AND 'public' = ANY(roles)
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.profiles TO authenticated', r.policyname);
  END LOOP;
END $$;
