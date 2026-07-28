CREATE TABLE public.mikrotiks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  network_id uuid NOT NULL REFERENCES public.networks(id) ON DELETE CASCADE,
  name text NOT NULL,
  host text NOT NULL,
  username text NOT NULL,
  password text NOT NULL DEFAULT '',
  port integer NOT NULL DEFAULT 8728,
  use_https boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mikrotiks TO authenticated;
GRANT ALL ON public.mikrotiks TO service_role;

ALTER TABLE public.mikrotiks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mikrotiks admin read" ON public.mikrotiks
  FOR SELECT TO authenticated
  USING (network_id = public.admin_network(auth.uid()));

CREATE POLICY "mikrotiks admin insert" ON public.mikrotiks
  FOR INSERT TO authenticated
  WITH CHECK (network_id = public.admin_network(auth.uid()));

CREATE POLICY "mikrotiks admin update" ON public.mikrotiks
  FOR UPDATE TO authenticated
  USING (network_id = public.admin_network(auth.uid()))
  WITH CHECK (network_id = public.admin_network(auth.uid()));

CREATE POLICY "mikrotiks admin delete" ON public.mikrotiks
  FOR DELETE TO authenticated
  USING (network_id = public.admin_network(auth.uid()));

CREATE TRIGGER mikrotiks_touch_updated_at
  BEFORE UPDATE ON public.mikrotiks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();