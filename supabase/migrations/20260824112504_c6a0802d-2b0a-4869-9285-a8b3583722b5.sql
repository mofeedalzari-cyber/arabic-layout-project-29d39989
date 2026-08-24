CREATE TABLE IF NOT EXISTS public.app_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_flags TO authenticated;
GRANT INSERT, UPDATE ON public.app_flags TO authenticated;
GRANT ALL ON public.app_flags TO service_role;

ALTER TABLE public.app_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_flags_read" ON public.app_flags;
CREATE POLICY "app_flags_read" ON public.app_flags
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "app_flags_super_insert" ON public.app_flags;
CREATE POLICY "app_flags_super_insert" ON public.app_flags
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'superadmin'));

DROP POLICY IF EXISTS "app_flags_super_update" ON public.app_flags;
CREATE POLICY "app_flags_super_update" ON public.app_flags
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'superadmin'))
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'));

INSERT INTO public.app_flags (key, enabled) VALUES ('mikrotiks_nav', true)
ON CONFLICT (key) DO NOTHING;